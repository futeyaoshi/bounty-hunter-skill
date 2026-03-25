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
      const needed = totalBounty * 120n / 100n; // bounty + ~20% fee buffer
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
