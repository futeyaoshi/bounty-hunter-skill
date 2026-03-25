#!/usr/bin/env node
/**
 * niuma.js - Niuma Bounty Platform CLI
 * task.niuma.works on XLayer (Chain ID: 1952)
 * Read-only queries + unsigned transaction builder for wallet plugins.
 */
const { ethers } = require("ethers");
const CONF = require("../references/contracts.json");
const ABIS = require("../references/abis.json");

const STATUS = {0:"Pending",1:"Open",2:"InProgress",3:"UnderReview",4:"Completed",5:"Disputed",6:"Cancelled",7:"Rejected"};
const TYPE   = {0:"Normal",1:"Bidding"};

function provider() {
  return new ethers.JsonRpcProvider(process.env.NIUMA_RPC || CONF.rpc);
}
const core    = () => new ethers.Contract(CONF.contracts.core,        ABIS.BountyPlatformCore,    provider());
const query   = () => new ethers.Contract(CONF.contracts.queryHelper,  ABIS.BountyQueryHelper,     provider());
const bidding = () => new ethers.Contract(CONF.contracts.bidding,      ABIS.BountyPlatformBidding, provider());
const token   = (a) => new ethers.Contract(a, ABIS.ERC20, provider());

function fmt(t) {
  return {
    id: t.id.toString(), title: t.title, description: t.description,
    requirements: t.requirements, creator: t.creator, hunter: t.hunter,
    bountyPerUser: ethers.formatEther(t.bountyPerUser),
    totalBounty:   ethers.formatEther(t.totalBounty),
    token: t.tokenAddress === ethers.ZeroAddress ? "OKB(native)" : t.tokenAddress,
    maxParticipants: t.maxParticipants.toString(),
    currentParticipants: t.currentParticipants.toString(),
    startTime: new Date(Number(t.startTime)*1000).toISOString(),
    endTime:   new Date(Number(t.endTime)*1000).toISOString(),
    type: TYPE[Number(t.taskType)] || t.taskType.toString(),
    status: STATUS[Number(t.status)] || t.status.toString(),
    categoryId: t.categoryId.toString(),
    createdAt: new Date(Number(t.createdAt)*1000).toISOString(),
    isPaused: t.isPaused
  };
}

const cmds = {
  async contracts() {
    console.log(JSON.stringify(CONF, null, 2));
  },

  async count() {
    const c = await query().getActiveTaskCount();
    console.log(JSON.stringify({ activeTasks: c.toString() }));
  },

  async task(id) {
    const t = await core().getTaskInfo(id);
    console.log(JSON.stringify(fmt(t), null, 2));
  },

  async status(id) {
    const s = await core().getTaskStatus(id);
    const n = Number(s);
    console.log(JSON.stringify({ taskId: id, status: n, statusText: STATUS[n]||'Unknown' }));
  },

  async list(offset=0, limit=20) {
    const tasks = await query().getActiveTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async pending(offset=0, limit=20) {
    const tasks = await query().getPendingReviewTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async paginated(offset=0, limit=20) {
    const tasks = await query().getTasksPaginated(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async 'by-status'(status, offset=0, limit=20) {
    const ids = await query().getTaskIdsByStatusPaginated(status, offset, limit);
    console.log(JSON.stringify({ status: STATUS[Number(status)]||status, ids: ids.map(i=>i.toString()) }));
  },

  async 'user-tasks'(addr) {
    const [created, participated] = await Promise.all([
      core().getUserCreatedTasks(addr),
      core().getUserParticipatedTasks(addr)
    ]);
    console.log(JSON.stringify({
      address: addr,
      created: created.map(i=>i.toString()),
      participated: participated.map(i=>i.toString())
    }, null, 2));
  },

  async bids(taskId) {
    const all = await bidding().getAllBids(taskId);
    const result = all.map(b => ({
      bidder: b.bidder, bidAmount: ethers.formatEther(b.bidAmount),
      proposal: b.proposal, contactInfo: b.contactInfo,
      bidTime: new Date(Number(b.bidTime)*1000).toISOString(),
      isSelected: b.isSelected, isLost: b.isLost
    }));
    console.log(JSON.stringify({ taskId, bids: result }, null, 2));
  },

  async balance(addr, tokenAddr) {
    const p = provider();
    if (!tokenAddr || tokenAddr === 'native') {
      const bal = await p.getBalance(addr);
      console.log(JSON.stringify({ address: addr, token: 'OKB', balance: ethers.formatEther(bal) }));
    } else {
      const tok = token(tokenAddr);
      const [bal, sym, dec] = await Promise.all([tok.balanceOf(addr), tok.symbol(), tok.decimals()]);
      console.log(JSON.stringify({ address: addr, token: sym, tokenAddress: tokenAddr, balance: ethers.formatUnits(bal, dec) }));
    }
  },

  async allowance(ownerAddr, tokenAddr) {
    const tok = token(tokenAddr);
    const [val, sym, dec] = await Promise.all([
      tok.allowance(ownerAddr, CONF.contracts.core),
      tok.symbol(), tok.decimals()
    ]);
    console.log(JSON.stringify({ owner: ownerAddr, spender: CONF.contracts.core, token: sym, allowance: ethers.formatUnits(val, dec) }));
  },

  // ── 前置检查工具函数 ─────────────────────────────────────────────

  /**
   * 检查发任务所有前置条件，返回 { pass, checks } 结构。
   * checks 是数组，每项 { name, pass, detail }
   */
  async _preCheckCreate(args, signerAddress) {
    const p = provider();
    const checks = [];
    const fail = (name, detail) => checks.push({ name, pass: false, detail });
    const ok   = (name, detail) => checks.push({ name, pass: true,  detail });

    // 1. 参数合规
    if (!args.title || args.title.trim() === '') { fail('title', '标题不能为空'); }
    else ok('title', args.title);

    const bountyPerUser = parseFloat(args.bountyPerUser);
    if (isNaN(bountyPerUser) || bountyPerUser <= 0) { fail('bountyPerUser', '赏金必须 > 0'); }

    const maxP = parseInt(args.maxParticipants) || 1;
    if (maxP <= 0) { fail('maxParticipants', '参与人数必须 > 0'); }

    // 2. 时间合规
    const block = await p.getBlock('latest');
    const now = block.timestamp;
    const startTime = args.startTime || (now + 120);
    const endTime   = args.endTime   || (now + 86400);
    if (endTime <= now) { fail('endTime', `已过期，当前链上时间 ${new Date(now*1000).toISOString()}`); }
    else ok('endTime', new Date(endTime*1000).toISOString());
    if (startTime >= endTime) { fail('startTime<endTime', 'startTime 必须早于 endTime'); }
    else ok('startTime<endTime', 'ok');

    // 3. 分类合规
    const catMgr = new ethers.Contract(CONF.contracts.categoryManager, [
      'function categoryCount() view returns (uint256)',
      'function categories(uint256) view returns (uint256 id, string name, bool enabled, uint256 createdAt)'
    ], p);
    const categoryId = parseInt(args.categoryId) || 1;
    try {
      const catCount = await catMgr.categoryCount();
      if (categoryId < 1 || BigInt(categoryId) > catCount) {
        fail('categoryId', `categoryId ${categoryId} 不存在，当前共 ${catCount} 个分类`);
      } else {
        const cat = await catMgr.categories(categoryId);
        if (!cat.enabled) { fail('categoryId', `分类 ${cat.name} 已禁用`); }
        else ok('categoryId', `${cat.name} (enabled)`);
      }
    } catch(e) { fail('categoryId', '分类查询失败: ' + e.message); }

    // 4. Token 限额
    const tokenAddr = args.tokenAddress || CONF.contracts.niumaToken;
    const isNative = tokenAddr === ethers.ZeroAddress;
    if (!isNative) {
      try {
        const tmgr = new ethers.Contract(CONF.contracts.tokenManager, [
          'function getTokenInfo(address) view returns (tuple(address tokenAddress, string symbol, uint8 decimals, uint256 baseFee, uint256 communityFeePercentage, uint256 developerFeePercentage, uint256 referralFeePercentage, uint256 minAmount, uint256 maxAmount, bool enabled, uint256 sortOrder, uint256 niumaRate))'
        ], p);
        const info = await tmgr.getTokenInfo(tokenAddr);
        if (!info.enabled) { fail('token', `token ${info.symbol} 未被平台启用`); }
        const bountyWei = ethers.parseEther(bountyPerUser.toString());
        if (bountyWei < info.minAmount) {
          fail('minAmount', `bountyPerUser ${bountyPerUser} 低于最低 ${ethers.formatEther(info.minAmount)} ${info.symbol}`);
        } else if (bountyWei > info.maxAmount) {
          fail('maxAmount', `bountyPerUser ${bountyPerUser} 高于最高 ${ethers.formatEther(info.maxAmount)} ${info.symbol}`);
        } else {
          ok('amount_range', `${ethers.formatEther(info.minAmount)} ~ ${ethers.formatEther(info.maxAmount)} ${info.symbol}`);
        }
      } catch(e) { fail('tokenManager', '限额查询失败: ' + e.message); }
    }

    // 5. 余额 & allowance
    if (!isNative) {
      try {
        const niuma = new ethers.Contract(tokenAddr, ABIS.ERC20, p);
        const bountyWei = ethers.parseEther(bountyPerUser.toString());
        const totalNeeded = bountyWei * BigInt(maxP) * 115n / 100n; // +15% 手续费
        const [bal, allowanceVal] = await Promise.all([
          niuma.balanceOf(signerAddress),
          niuma.allowance(signerAddress, CONF.contracts.core)
        ]);
        const sym = 'NIUMA';
        if (bal < totalNeeded) {
          fail('balance', `余额不足：有 ${ethers.formatEther(bal)} ${sym}，需要 ~${ethers.formatEther(totalNeeded)} ${sym}（含手续费）`);
        } else {
          ok('balance', `${ethers.formatEther(bal)} ${sym} >= ~${ethers.formatEther(totalNeeded)} ${sym}`);
        }
        if (allowanceVal < totalNeeded) {
          ok('allowance', `当前授权 ${ethers.formatEther(allowanceVal)} ${sym}，不足，将自动 approve`);
        } else {
          ok('allowance', `已授权 ${ethers.formatEther(allowanceVal)} ${sym}，足够`);
        }
      } catch(e) { fail('balance_check', '余额检查失败: ' + e.message); }
    } else {
      // OKB native
      try {
        const bountyWei = ethers.parseEther(bountyPerUser.toString());
        const totalNeeded = bountyWei * BigInt(maxP);
        const bal = await p.getBalance(signerAddress);
        if (bal < totalNeeded) {
          fail('balance', `OKB 余额不足：有 ${ethers.formatEther(bal)}，需要 ${ethers.formatEther(totalNeeded)}`);
        } else {
          ok('balance', `${ethers.formatEther(bal)} OKB >= ${ethers.formatEther(totalNeeded)} OKB`);
        }
      } catch(e) { fail('balance_check', 'OKB 余额检查失败: ' + e.message); }
    }

    const pass = checks.every(c => c.pass);
    return { pass, checks };
  },

  /**
   * 检查接单所有前置条件，返回 { pass, checks } 结构。
   */
  async _preCheckParticipate(taskId, signerAddress) {
    const p = provider();
    const checks = [];
    const fail = (name, detail) => checks.push({ name, pass: false, detail });
    const ok   = (name, detail) => checks.push({ name, pass: true,  detail });

    // 1. 获取任务信息
    let task;
    try {
      task = await core().getTaskInfo(taskId);
    } catch(e) {
      fail('task_exists', `任务 #${taskId} 获取失败: ` + e.message);
      return { pass: false, checks };
    }

    // 2. 任务状态必须是 Open (1)
    const status = Number(task.status);
    if (status !== 1) {
      fail('status', `任务状态为 ${STATUS[status]||status}，必须是 Open`);
    } else {
      ok('status', 'Open');
    }

    // 3. 参与人数未满
    const curP = Number(task.currentParticipants);
    const maxP = Number(task.maxParticipants);
    if (curP >= maxP) {
      fail('participants', `名额已满 (${curP}/${maxP})`);
    } else {
      ok('participants', `${curP}/${maxP}`);
    }

    // 4. 未过期
    const block = await p.getBlock('latest');
    const now = block.timestamp;
    const endTime = Number(task.endTime);
    if (endTime <= now) {
      fail('endTime', `任务已过期 (${new Date(endTime*1000).toISOString()})`);
    } else {
      const remaining = endTime - now;
      ok('endTime', `距截止还有 ${Math.floor(remaining/3600)}h${Math.floor((remaining%3600)/60)}m`);
    }

    // 5. 不能接自己的任务
    if (task.creator.toLowerCase() === signerAddress.toLowerCase()) {
      fail('not_own_task', '不能接自己发布的任务');
    } else {
      ok('not_own_task', 'ok');
    }

    // 6. 押金检查
    const tokenAddr = task.tokenAddress === ethers.ZeroAddress ? CONF.contracts.niumaToken : task.tokenAddress;
    const bountyWei = task.bountyPerUser;
    try {
      const upc = new ethers.Contract(CONF.contracts.userProfileCredit, [
        'function hunterStake(address) view returns (uint256)',
        'function lockedStake(address) view returns (uint256)',
        'function calculateNiumaStake(address token, uint256 amount) view returns (uint256)'
      ], p);
      const [totalStake, lockedStake, requiredStake] = await Promise.all([
        upc.hunterStake(signerAddress),
        upc.lockedStake(signerAddress),
        upc.calculateNiumaStake(tokenAddr, bountyWei)
      ]);
      const available = totalStake - lockedStake;
      if (available < requiredStake) {
        fail('stake', `押金不足：可用 ${ethers.formatEther(available)} NIUMA，需要 ${ethers.formatEther(requiredStake)} NIUMA。请先执行 stake 命令充值`);
      } else {
        ok('stake', `可用押金 ${ethers.formatEther(available)} NIUMA >= 需要 ${ethers.formatEther(requiredStake)} NIUMA`);
      }
    } catch(e) {
      fail('stake_check', '押金检查失败: ' + e.message);
    }

    // 7. 合约级资格检查（canAcceptTask）
    try {
      const abiCoder = new ethers.AbiCoder();
      const upcAddr = CONF.contracts.userProfileCredit;
      // 0xb44d0157 = canAcceptTask(address,uint256,address)
      const tokenAddr2 = task.tokenAddress === ethers.ZeroAddress ? CONF.contracts.niumaToken : task.tokenAddress;
      const eligData = '0xb44d0157' + abiCoder.encode(
        ['address','uint256','address'],
        [signerAddress, task.bountyPerUser, tokenAddr2]
      ).slice(2);
      const eligResult = await p.call({ to: upcAddr, data: eligData });
      const eligible = abiCoder.decode(['bool'], eligResult)[0];
      if (!eligible) {
        // 查冷却时间
        const lastTimeData = '0xcf1513fc' + abiCoder.encode(['address'], [signerAddress]).slice(2);
        const cooldownData = '0x2bf403a3';
        const [lastTimeRes, cooldownRes] = await Promise.all([
          p.call({ to: upcAddr, data: lastTimeData }).catch(() => null),
          p.call({ to: upcAddr, data: cooldownData }).catch(() => null),
        ]);
        const block = await p.getBlock('latest');
        let reason = 'canAcceptTask 返回 false';
        if (lastTimeRes && cooldownRes) {
          const lastTime = abiCoder.decode(['uint256'], lastTimeRes)[0];
          const cooldown = abiCoder.decode(['uint256'], cooldownRes)[0];
          const elapsed = BigInt(block.timestamp) - lastTime;
          if (lastTime > 0n && elapsed < cooldown) {
            const wait = cooldown - elapsed;
            const mins = Math.ceil(Number(wait) / 60);
            reason = `接单冷却中，还需等待 ${wait}秒（约${mins}分钟），上次接单: ${new Date(Number(lastTime)*1000).toISOString()}`;
          } else {
            // 查信用分
            const credData = '0xfe5ff468' + abiCoder.encode(['address'], [signerAddress]).slice(2);
            const minScoreData = '0x76f79b10';
            const [credRes, minScoreRes] = await Promise.all([
              p.call({ to: upcAddr, data: credData }).catch(() => null),
              p.call({ to: upcAddr, data: minScoreData }).catch(() => null),
            ]);
            if (credRes && minScoreRes) {
              const cred = abiCoder.decode(['uint256','uint256','uint256','uint256','bool'], credRes);
              const minScore = abiCoder.decode(['uint256'], minScoreRes)[0];
              const hunterScore = cred[0];
              if (hunterScore < minScore) {
                reason = `信用分不足：当前 ${hunterScore}，最低要求 ${minScore}`;
              } else {
                reason = `押金不足或已被封禁，请检查钱包状态`;
              }
            }
          }
        }
        fail('eligibility', reason);
      } else {
        ok('eligibility', 'canAcceptTask 验证通过');
      }
    } catch(e) {
      ok('eligibility', '资格验证跳过（查询失败: ' + e.message.slice(0,50) + '）');
    }

    const pass = checks.every(c => c.pass);
    return { pass, checks };
  },

  // ── 只读前置检查命令（供 AI 预检）─────────────────────────────────

  async 'check-create'(jsonStr) {
    const args = JSON.parse(jsonStr);
    // 需要地址：从 NIUMA_WALLET_SECRET 或 args.from
    let signerAddress = args.from;
    if (!signerAddress) {
      const signer = await cmds._signer();
      signerAddress = signer.address;
    }
    const result = await cmds._preCheckCreate(args, signerAddress);
    const failed = result.checks.filter(c => !c.pass);
    console.log(JSON.stringify({
      address: signerAddress, pass: result.pass,
      summary: result.pass ? '✅ 所有检查通过，可以发任务' : `❌ ${failed.length} 项检查未通过`,
      checks: result.checks
    }, null, 2));
  },

  async 'check-participate'(taskId, fromAddr) {
    let signerAddress = fromAddr;
    if (!signerAddress) {
      const signer = await cmds._signer();
      signerAddress = signer.address;
    }
    const result = await cmds._preCheckParticipate(BigInt(taskId), signerAddress);
    const failed = result.checks.filter(c => !c.pass);
    console.log(JSON.stringify({
      address: signerAddress, taskId, pass: result.pass,
      summary: result.pass ? '✅ 所有检查通过，可以接单' : `❌ ${failed.length} 项检查未通过`,
      checks: result.checks
    }, null, 2));
  },

  // ── 写操作（需要 NIUMA_WALLET_SECRET）─────────────────────────────
  async _signer() {
    const pk = process.env.NIUMA_WALLET_SECRET;
    if (!pk) throw new Error('NIUMA_WALLET_SECRET not set');
    const p = new ethers.JsonRpcProvider(process.env.NIUMA_RPC || CONF.rpc, undefined, {staticNetwork: true, polling: false});
    return new ethers.Wallet(pk, p);
  },

  async _sendTx(contract, method, args, extraOpts={}) {
    const c = contract;
    const signer = c.runner;
    const p = signer.provider;
    const gasEstimate = await c[method].estimateGas(...args, extraOpts).catch(() => 950000n);
    const gasLimit = gasEstimate * 120n / 100n;
    const feeData = await p.getFeeData();
    const nonce = await p.getTransactionCount(signer.address);
    const tx = await c[method](...args, { gasLimit, gasPrice: feeData.gasPrice, nonce, ...extraOpts });
    process.stderr.write('tx sent: ' + tx.hash + '\n');
    let receipt = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      receipt = await p.getTransactionReceipt(tx.hash).catch(() => null);
      if (receipt) break;
    }
    return { txHash: tx.hash, block: receipt?.blockNumber, status: receipt?.status === 1 ? 'success' : 'failed' };
  },

  async approve(tokenAddr, spender, amount) {
    // approve <tokenAddress> <spender> <amount>
    const signer = await cmds._signer();
    const tok = new ethers.Contract(tokenAddr, ABIS.ERC20, signer);
    // check current allowance
    const current = await tok.allowance(signer.address, spender);
    const amtWei = ethers.parseEther(amount.toString());
    if (current >= amtWei) {
      console.log(JSON.stringify({ already_approved: true, allowance: ethers.formatEther(current), spender }));
      return;
    }
    const result = await cmds._sendTx(tok, 'approve', [spender, amtWei]);
    console.log(JSON.stringify({ ...result, spender, amount }));
  },

  async create(jsonStr) {
    const args = JSON.parse(jsonStr);
    const signer = await cmds._signer();
    const p = signer.provider;
    const coreC = new ethers.Contract(CONF.contracts.core, ABIS.BountyPlatformCore, signer);
    const niuma = new ethers.Contract(CONF.contracts.niumaToken, ABIS.ERC20, signer);

    // ── 前置检查 ──
    const preCheck = await cmds._preCheckCreate(args, signer.address);
    const hardFails = preCheck.checks.filter(c => !c.pass && c.name !== 'allowance');
    if (hardFails.length > 0) {
      const msg = hardFails.map(c => `[${c.name}] ${c.detail}`).join('; ');
      console.error(JSON.stringify({ error: '前置检查未通过，交易已取消', failed: hardFails }));
      process.exit(1);
    }

    const bountyWei = ethers.parseEther(args.bountyPerUser.toString());
    const maxP = BigInt(args.maxParticipants || 1);
    const tokenAddr = args.tokenAddress || CONF.contracts.niumaToken;
    const taskType = args.taskType || 0;
    const totalBounty = taskType === 0 ? bountyWei * maxP : bountyWei;

    // get chain timestamp
    const block = await p.getBlock('latest');
    const startTime = args.startTime || (block.timestamp + 120);
    const endTime   = args.endTime   || (block.timestamp + 86400);

    // check & approve allowance
    if (tokenAddr !== ethers.ZeroAddress) {
      const needed = totalBounty * 115n / 100n; // bounty + ~15% fee buffer
      const allowance = await niuma.allowance(signer.address, CONF.contracts.core);
      if (allowance < needed) {
        process.stderr.write('approving NIUMA...\n');
        const approveTx = await niuma.approve(CONF.contracts.core, needed * 2n);
        await approveTx.wait();
        process.stderr.write('approved: ' + approveTx.hash + '\n');
      }
    }

    const txArgs = [
      args.title, args.description || '', taskType,
      bountyWei, maxP, startTime, endTime,
      args.requirements || '', tokenAddr, BigInt(args.categoryId || 1)
    ];
    const result = await cmds._sendTx(coreC, 'createTask', txArgs,
      tokenAddr === ethers.ZeroAddress ? { value: totalBounty } : {});
    console.log(JSON.stringify({ ...result, title: args.title, bountyPerUser: args.bountyPerUser, startTime, endTime }));
  },

  async participate(taskId) {
    const signer = await cmds._signer();
    const coreC = new ethers.Contract(CONF.contracts.core, ABIS.BountyPlatformCore, signer);

    // ── 前置检查 ──
    const preCheck = await cmds._preCheckParticipate(BigInt(taskId), signer.address);
    if (!preCheck.pass) {
      const failed = preCheck.checks.filter(c => !c.pass);
      console.error(JSON.stringify({ error: '接单前置检查未通过，交易已取消', failed }));
      process.exit(1);
    }

    const result = await cmds._sendTx(coreC, 'participateTask', [BigInt(taskId)]);
    console.log(JSON.stringify({ ...result, taskId }));
  },

  async stake(amount) {
    // stake <amount> — deposit NIUMA to UserProfileCredit
    const signer = await cmds._signer();
    const upc = new ethers.Contract(CONF.contracts.userProfileCredit, [
      'function stakeHunter(uint256) external',
      'function hunterStake(address) view returns (uint256)',
      'function lockedStake(address) view returns (uint256)'
    ], signer);
    const niuma = new ethers.Contract(CONF.contracts.niumaToken, ABIS.ERC20, signer);
    const amtWei = ethers.parseEther(amount.toString());

    // ── 前置检查：余额够不够 ──
    const bal = await niuma.balanceOf(signer.address);
    if (bal < amtWei) {
      console.error(JSON.stringify({ error: 'NIUMA 余额不足，押金充值取消', balance: ethers.formatEther(bal), requested: amount }));
      process.exit(1);
    }

    // approve first
    const allowance = await niuma.allowance(signer.address, CONF.contracts.userProfileCredit);
    if (allowance < amtWei) {
      process.stderr.write('approving NIUMA to userProfileCredit...\n');
      const tx = await niuma.approve(CONF.contracts.userProfileCredit, amtWei * 2n);
      await tx.wait();
      process.stderr.write('approved: ' + tx.hash + '\n');
    }
    const result = await cmds._sendTx(upc, 'stakeHunter', [amtWei]);
    const [total, locked] = await Promise.all([upc.hunterStake(signer.address), upc.lockedStake(signer.address)]);
    console.log(JSON.stringify({ ...result, staked: amount, totalStake: ethers.formatEther(total), lockedStake: ethers.formatEther(locked), available: ethers.formatEther(total - locked) }));
  },

  async unstake(amount) {
    // unstake <amount> — withdraw unlocked NIUMA from UserProfileCredit
    const signer = await cmds._signer();
    const upc = new ethers.Contract(CONF.contracts.userProfileCredit, [
      'function withdrawStake(uint256) external',
      'function hunterStake(address) view returns (uint256)',
      'function lockedStake(address) view returns (uint256)'
    ], signer);
    const [total, locked] = await Promise.all([upc.hunterStake(signer.address), upc.lockedStake(signer.address)]);
    const available = total - locked;
    const amtWei = ethers.parseEther(amount.toString());
    if (available < amtWei) {
      console.log(JSON.stringify({ error: 'insufficient unlocked stake', available: ethers.formatEther(available), locked: ethers.formatEther(locked) }));
      return;
    }
    const result = await cmds._sendTx(upc, 'withdrawStake', [amtWei]);
    console.log(JSON.stringify({ ...result, withdrawn: amount }));
  },

  async 'stake-info'(addr) {
    const address = addr || (await cmds._signer()).address;
    const upc = new ethers.Contract(CONF.contracts.userProfileCredit, [
      'function hunterStake(address) view returns (uint256)',
      'function lockedStake(address) view returns (uint256)'
    ], provider());
    const [total, locked] = await Promise.all([upc.hunterStake(address), upc.lockedStake(address)]);
    console.log(JSON.stringify({ address, totalStake: ethers.formatEther(total), lockedStake: ethers.formatEther(locked), available: ethers.formatEther(total - locked) }));
  },

  async 'build-tx'(cmd, jsonArgs) {
    const args = JSON.parse(jsonArgs);
    const p = provider();
    const coreIface    = new ethers.Interface(ABIS.BountyPlatformCore);
    const biddingIface = new ethers.Interface(ABIS.BountyPlatformBidding);
    const erc20Iface   = new ethers.Interface(ABIS.ERC20);
    let to, data, value = '0';

    switch(cmd) {
      case 'createTask': {
        const bountyWei = ethers.parseEther(args.bountyPerUser.toString());
        const total = bountyWei * BigInt(args.maxParticipants);
        const tokenAddr = args.tokenAddress || ethers.ZeroAddress;
        to   = CONF.contracts.core;
        data = coreIface.encodeFunctionData('createTask', [
          args.title, args.description, args.taskType||0,
          bountyWei, args.maxParticipants,
          args.startTime, args.endTime,
          args.requirements||'', tokenAddr, args.categoryId||1
        ]);
        if (tokenAddr === ethers.ZeroAddress) value = total.toString();
        break;
      }
      case 'participateTask':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('participateTask', [args.taskId]); break;
      case 'submitTask':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('submitTask', [args.taskId, args.proofHash||'', args.metadata||'']); break;
      case 'approveSubmission':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('approveSubmission', [args.taskId, args.participant]); break;
      case 'batchApprove':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('batchApprove', [args.taskId, args.participants]); break;
      case 'rejectSubmission':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('rejectSubmission', [args.taskId, args.participant, args.reason||'']); break;
      case 'cancelTask':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('cancelTask', [args.taskId]); break;
      case 'createDispute':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('createDispute', [args.taskId, args.reason||'', args.evidenceHash||'']); break;
      case 'resolveDispute':
        to = CONF.contracts.core;
        data = coreIface.encodeFunctionData('resolveDispute', [args.taskId, args.disputeIndex||0, args.hunterWins===true]); break;
      case 'submitBid':
        to = CONF.contracts.bidding;
        data = biddingIface.encodeFunctionData('submitBid', [args.taskId, ethers.parseEther(args.bidAmount.toString()), args.proposal||'', args.contactInfo||'']); break;
      case 'cancelBid':
        to = CONF.contracts.bidding;
        data = biddingIface.encodeFunctionData('cancelBid', [args.taskId]); break;
      case 'selectBidder':
        to = CONF.contracts.bidding;
        data = biddingIface.encodeFunctionData('selectBidder', [args.taskId, args.bidder]); break;
      case 'approveToken':
        to = args.tokenAddress;
        data = erc20Iface.encodeFunctionData('approve', [CONF.contracts.core, ethers.parseEther(args.amount.toString())]); break;
      default:
        console.error(JSON.stringify({ error: 'Unknown command: ' + cmd })); process.exit(1);
    }

    const feeData = await p.getFeeData();
    const nonce   = args.from ? await p.getTransactionCount(args.from) : undefined;
    console.log(JSON.stringify({
      unsignedTx: { to, data, value, chainId: CONF.chainId, gasPrice: feeData.gasPrice?.toString(), nonce },
      description: cmd + ' on Niuma Bounty Platform',
      chain: CONF.network
    }, null, 2));
  }
};

const [,,cmd,...rest] = process.argv;
(async () => {
  if (!cmd || !cmds[cmd]) {
    console.log(`
Niuma Bounty Platform CLI  -  task.niuma.works / XLayer
Read-only queries + unsigned tx builder for wallet plugins.

READ (no credentials needed):
  contracts                             All contract addresses
  count                                 Active task count
  task <id>                             Task details
  status <id>                           Task status
  list [offset] [limit]                 Active tasks
  pending [offset] [limit]              Tasks under review
  paginated [offset] [limit]            All tasks
  by-status <0-7> [offset] [limit]      Tasks by status
  user-tasks <address>                  Tasks by user
  bids <taskId>                         Bids for a task
  balance <address> [tokenAddress]      Wallet balance
  allowance <address> <tokenAddress>    ERC20 allowance
  stake-info [address]                  NIUMA stake/locked balance
  check-create '<json>'                 预检发任务条件（不发交易）
  check-participate <taskId> [address]  预检接单条件（不发交易）

WRITE (requires NIUMA_WALLET_SECRET env var):
  approve <tokenAddr> <spender> <amount>  Approve ERC20 (auto-skips if enough)
  create '<json>'                         Create task (auto-approves if needed)
  participate <taskId>                    Join a task
  stake <amount>                          Deposit NIUMA to UserProfileCredit
  unstake <amount>                        Withdraw unlocked NIUMA

BUILD UNSIGNED TX (for wallet plugin signing):
  build-tx <command> '<json>'
  Commands: createTask participateTask submitTask approveSubmission
            batchApprove rejectSubmission cancelTask
            createDispute resolveDispute
            submitBid cancelBid selectBidder approveToken

ENV:
  NIUMA_RPC   Override RPC endpoint
`);
    return;
  }
  try {
    await cmds[cmd](...rest);
  } catch(e) {
    console.error(JSON.stringify({ error: e.reason || e.shortMessage || e.message }));
    process.exit(1);
  }
})();
