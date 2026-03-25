# niuma-bounty

Niuma 赏金平台 skill — 操作 task.niuma.works（XLayer 测试网）。

## 环境

```bash
cd SKILL_DIR && npm install
# 写操作需设置环境变量
export NIUMA_WALLET_SECRET=<私钥>
```

## 查询命令

```bash
node SKILL_DIR/scripts/niuma.js count                          # 活跃任务数
node SKILL_DIR/scripts/niuma.js list [offset] [limit]          # 活跃任务列表
node SKILL_DIR/scripts/niuma.js task <id>                      # 任务详情
node SKILL_DIR/scripts/niuma.js user-tasks <address>           # 用户任务
node SKILL_DIR/scripts/niuma.js balance <address> [token]      # 余额
node SKILL_DIR/scripts/niuma.js stake-info [address]           # 押金状态
node SKILL_DIR/scripts/niuma.js bids <taskId>                  # 竞标列表
```

## 发任务

```bash
# 第一步：预检（不发交易，确认条件）
node SKILL_DIR/scripts/niuma.js check-create '<json>'

# 第二步：发任务（内置检查，不过直接报错）
node SKILL_DIR/scripts/niuma.js create '<json>'
```

参数说明：
```json
{
  "title": "任务标题",
  "description": "描述",
  "bountyPerUser": "100",
  "maxParticipants": 5,
  "categoryId": 1,
  "requirements": "要求说明"
}
```

> startTime/endTime 不填默认：2分钟后开始，24小时后截止。
> bountyPerUser 限额从链上 tokenManager 实时读取，check-create 会自动验证。
> allowance 不足时自动 approve，无需手动处理。

## 接单

```bash
# 第一步：预检（可选，内置检查已覆盖）
node SKILL_DIR/scripts/niuma.js check-participate <taskId>

# 第二步：接单
node SKILL_DIR/scripts/niuma.js participate <taskId>
```

> 押金不足时先充值：`node SKILL_DIR/scripts/niuma.js stake <amount>`

## 押金管理

```bash
node SKILL_DIR/scripts/niuma.js stake <amount>     # 充值押金
node SKILL_DIR/scripts/niuma.js unstake <amount>   # 提取押金
```

## 其他写操作

```bash
# 提交工作
node SKILL_DIR/scripts/niuma.js build-tx submitTask '{"taskId":1,"proofHash":"...","metadata":""}'

# 审核通过
node SKILL_DIR/scripts/niuma.js build-tx approveSubmission '{"taskId":1,"participant":"0x..."}'

# 批量审核
node SKILL_DIR/scripts/niuma.js build-tx batchApprove '{"taskId":1,"participants":["0x...","0x..."]}'

# 取消任务
node SKILL_DIR/scripts/niuma.js build-tx cancelTask '{"taskId":1}'
```

> build-tx 返回未签名交易，配合钱包 skill 签名广播。

## 网络

- 链：XLayer 测试网，Chain ID: 1952
- 浏览器：https://www.oklink.com/xlayer-test
