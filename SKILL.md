# niuma-bounty

Niuma Bounty Platform skill — 操作 task.niuma.works 链上赏金任务平台（XLayer 测试网）。

支持：查询任务、发布任务、接单、提交工作、审核、招标竞价、余额查询、构建未签名交易。

> 所有合约地址从 `SKILL_DIR/references/contracts.json` 读取，不硬编码。

## 环境要求

- Node.js >= 18
- 依赖：`ethers@^6`（已包含在 package.json）
- 写操作需设置 `NIUMA_WALLET_SECRET` 环境变量

首次使用安装依赖：
```bash
cd SKILL_DIR && npm install
```

## 网络配置

见 `SKILL_DIR/references/contracts.json`：
- 链：XLayer 测试网，Chain ID: 1952
- RPC: https://xlayertestrpc.okx.com
- 浏览器: https://www.oklink.com/xlayer-test
- 关键合约字段：`core`, `bidding`, `queryHelper`, `niumaToken`, `userProfileCredit`, `tokenManager`, `categoryManager`, `referralSystem`, `registry`

## 查询参考信息（发任务前必看）

### 查询可用分类（categoryId）

```bash
node SKILL_DIR/scripts/niuma.js list 0 1
# 返回的任务中含 categoryId 字段，可参考现有任务使用的分类
```

或直接链上查询：
```
合约：contracts.json → categoryManager
ABI：[
  "function categoryCount() view returns (uint256)",
  "function categories(uint256) view returns (uint256 id, string name, bool enabled, uint256 createdAt)",
  "function getCategoryLimits(uint256) view returns (uint256 activeTasks, uint256 maxActiveTasks, uint256 maxParticipants, uint256 minBounty, bool enabled)"
]
用法：categoryCount() 查总数，categories(i) 查第 i 个分类名称和状态
```

当前已知分类（以链上为准）：
- categoryId: `1` — 推特（enabled, maxParticipants: 100）

### 查询并确认授权额度（allowance）

发任务或充值押金前，先检查 NIUMA 授权额度是否足够，不够则提前授权。

```
ABI：[
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
]
```

**发任务时：** spender = `contracts.json → core`
- 需要授权金额 = bountyPerUser × maxParticipants + 手续费（约 13%）
- 建议 approve 足够大的额度（如 10000 NIUMA），避免频繁授权

**充值押金时：** spender = `contracts.json → userProfileCredit`
- 需要授权金额 = 押金金额

```bash
# 快速查余额 + allowance
node SKILL_DIR/scripts/niuma.js balance <address> <niumaToken>
# 然后链上查 allowance(address, coreContract)
```

---

### 查询代币限额（minAmount / maxAmount）

```
合约：contracts.json → tokenManager
ABI：[
  "function getTokenInfo(address) view returns (tuple(address tokenAddress, string symbol, uint8 decimals, uint256 baseFee, uint256 communityFeePercentage, uint256 developerFeePercentage, uint256 referralFeePercentage, uint256 minAmount, uint256 maxAmount, bool enabled, uint256 sortOrder, uint256 niumaRate))"
]
getTokenInfo(niumaToken) → 查看 minAmount / maxAmount
```

当前 NIUMA 限额（以链上为准）：
- 最低：`100 NIUMA`
- 最高：`10,000,000 NIUMA`
- 手续费约 13%（communityFee + developerFee + referralReward）

---

## Task 状态

| 值 | 状态 | 含义 |
|----|------|------|
| 0 | Pending | 待审核 |
| 1 | Open | 开放接单 |
| 2 | InProgress | 进行中 |
| 3 | UnderReview | 待审核提交 |
| 4 | Completed | 已完成 |
| 5 | Disputed | 争议中 |
| 6 | Cancelled | 已取消 |
| 7 | Rejected | 已拒绝 |

## Task 类型

| 值 | 类型 | 说明 |
|----|------|------|
| 0 | Normal | 普通任务，先到先得 |
| 1 | Bidding | 招标任务，创建者选标 |

---

## CLI 用法

SKILL_DIR = 本 SKILL.md 所在目录。

### 读操作（无需私钥）

```bash
# 查单个任务
node SKILL_DIR/scripts/niuma.js task <taskId>

# 活跃任务列表
node SKILL_DIR/scripts/niuma.js list [offset] [limit]

# 所有任务分页（含已结束）
node SKILL_DIR/scripts/niuma.js paginated [offset] [limit]

# 待审核任务
node SKILL_DIR/scripts/niuma.js pending [offset] [limit]

# 按状态查询 (status: 0-7)
node SKILL_DIR/scripts/niuma.js by-status <status> [offset] [limit]

# 按分类查询
node SKILL_DIR/scripts/niuma.js by-category <categoryId> [offset] [limit]

# 活跃任务数量
node SKILL_DIR/scripts/niuma.js count

# 用户任务
node SKILL_DIR/scripts/niuma.js user-tasks <walletAddress>

# 招标任务的所有竞价
node SKILL_DIR/scripts/niuma.js bids <taskId>

# 钱包余额
node SKILL_DIR/scripts/niuma.js balance <address>                     # OKB
node SKILL_DIR/scripts/niuma.js balance <address> <tokenAddress>      # ERC20
```

### 写操作（需要 NIUMA_WALLET_SECRET）

```bash
export NIUMA_WALLET_SECRET=0x你的私钥
```

#### 发布任务（createTask）

⚠️ **注意事项：**
- `bountyPerUser` 最低 100 NIUMA（TokenManager 限制），最高 10,000,000 NIUMA
- `startTime` / `endTime` 必须用**链上 block.timestamp**，不是本地时间（两者通常相差 <2 秒，但建议 startTime 至少比当前链上时间晚 60 秒）
- `startTime` 最多不超过当前时间 +30 天，任务时长最长 30 天
- 创建任务会自动扣除 bounty 总额 + 平台手续费（约 13% 当前配置）
- gasLimit 建议 950000（实测约 825888）
- `categoryId` 从链上查询（当前分类见平台）

```bash
node SKILL_DIR/scripts/niuma.js create '<json>'
```

JSON 字段：
```json
{
  "title": "任务标题（最长100字符）",
  "description": "任务描述（最长300字符）",
  "requirements": "完成要求",
  "taskType": 0,
  "bountyPerUser": "100",
  "maxParticipants": 5,
  "startTime": 1711900800,
  "endTime": 1712505600,
  "tokenAddress": "<从contracts.json读取niumaToken>",
  "categoryId": 1
}
```

#### 构建未签名交易（build-tx）

适合配合 OKX Agentic Wallet 等外部钱包签名：

```bash
node SKILL_DIR/scripts/niuma.js build-tx <action> '<json>'
```

支持的 action：
- `participateTask` — 接单
- `submitWork` — 提交工作
- `approveSubmission` — 审核通过
- `rejectSubmission` — 审核拒绝
- `cancelParticipation` — 取消接单
- `placeBid` — 竞价

---

## 接单押金说明（重要）

接单（participateTask）前，需要先在 **UserProfileCredit 合约**中存入 NIUMA 押金。
合约地址从 `contracts.json` 中的 `userProfileCredit` 字段读取。

### 押金规则

- 押金代币：**NIUMA**（地址见 `contracts.json` → `niumaToken`）
- 押金比例：任务赏金的 **100%**（默认，管理员可调整）
- 押金在任务完成/审核通过后自动释放
- 如果可用押金不足，`participateTask` 会 revert

### 查询押金状态

```
ABI：[
  "function hunterStake(address) view returns (uint256)",
  "function lockedStake(address) view returns (uint256)",
  "function calculateNiumaStake(address token, uint256 amount) view returns (uint256)"
]
可用押金 = hunterStake(address) - lockedStake(address)
```

### 充值押金（stakeHunter）

⚠️ 先 approve NIUMA 给 UserProfileCredit 合约，再存入。

```
ABI：["function stakeHunter(uint256 amount) external"]
步骤：
1. approve NIUMA → userProfileCredit 合约
2. stakeHunter(amount)
```

### 提现押金（withdrawStake）

```
ABI：["function withdrawStake(uint256 amount) external"]
限制：只能提取未锁定的押金（hunterStake - lockedStake）
```

### 接单完整流程

1. 查任务赏金：`node SKILL_DIR/scripts/niuma.js task <taskId>` → 看 `bountyPerUser`
2. 计算所需押金：`calculateNiumaStake(tokenAddress, bountyPerUser)`
3. approve NIUMA → userProfileCredit
4. stakeHunter(押金金额)
5. participateTask

---

## 推荐配合：OKX Agentic Wallet

本 skill 的写操作（发任务、接单、审核等）需要钱包签名。推荐安装 **OKX Agentic Wallet** 处理签名和广播。

### 什么是 OKX Agentic Wallet？

OKX 官方出品的 AI Agent 钱包 skill。私钥在可信执行环境（TEE）中生成和保管，不暴露给任何人（包括 Agent）。支持 EVM + Solana，交易前自动风控检测。

### 安装方法

```bash
npx skills add okx/onchainos-skills
```

文档：https://web3.okx.com/zh-hans/onchainos/dev-docs/wallet/install-your-agentic-wallet
GitHub：https://github.com/okx/onchainos-skills

### 配合使用流程

```bash
# 第一步：构造未签名交易
node SKILL_DIR/scripts/niuma.js build-tx participateTask '{"taskId": 12, "from": "你的地址"}'

# 第二步：将返回的 unsignedTx 交给 OKX Agentic Wallet 签名广播

# 第三步：浏览器查看
# https://www.oklink.com/xlayer-test/tx/<txHash>
```
