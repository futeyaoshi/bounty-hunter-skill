#!/usr/bin/env node
/**
 * niuma.js - Niuma Bounty Platform CLI
 * task.niuma.works on XLayer (Chain ID: 1952)
 */
const { ethers } = require("ethers");
const CONTRACTS = require("../references/contracts.json");
const ABIS = require("../references/abis.json");

const STATUS = { 0:"Pending",1:"Open",2:"InProgress",3:"UnderReview",4:"Completed",5:"Disputed",6:"Cancelled",7:"Rejected" };
const TYPE   = { 0:"Normal",1:"Bidding" };

function provider() {
  return new ethers.JsonRpcProvider(process.env.NIUMA_RPC || CONTRACTS.rpc);
}
function signer() {
  const pk = process.env.NIUMA_PRIVATE_KEY;
  if (!pk) { console.error('{"error":"NIUMA_PRIVATE_KEY required"}'); process.exit(1); }
  return new ethers.Wallet(pk, provider());
}
const core    = (s) => new ethers.Contract(CONTRACTS.contracts.core,        ABIS.BountyPlatformCore,    s);
const query   = (s) => new ethers.Contract(CONTRACTS.contracts.queryHelper,  ABIS.BountyQueryHelper,     s);
const bidding = (s) => new ethers.Contract(CONTRACTS.contracts.bidding,      ABIS.BountyPlatformBidding, s);
const erc20   = (addr, s) => new ethers.Contract(addr, ABIS.ERC20, s);

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
    type: TYPE[t.taskType] || t.taskType.toString(),
    status: STATUS[t.status] || t.status.toString(),
    categoryId: t.categoryId.toString(),
    createdAt: new Date(Number(t.createdAt)*1000).toISOString(),
    isPaused: t.isPaused
  };
}

const cmds = {
  // ---- READ ----
  async task(id) {
    const t = await core(provider()).getTaskInfo(id);
    console.log(JSON.stringify(fmt(t), null, 2));
  },
  async list(offset=0, limit=20) {
    const tasks = await query(provider()).getActiveTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, offset, limit, tasks: tasks.map(fmt) }, null, 2));
  },
  async pending(offset=0, limit=20) {
    const tasks = await query(provider()).getPendingReviewTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },
  async paginated(offset=0, limit=20) {
    const tasks = await query(provider()).getTasksPaginated(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },
  async "by-status"(status, offset=0, limit=20) {
    const ids = await query(provider()).getTaskIdsByStatusPaginated(status, offset, limit);
    console.log(JSON.stringify({ status: STATUS[status]||status, ids: ids.map(i=>i.toString()) }, null, 2));
  },
  async "by-category"(catId, offset=0, limit=20) {
    const tasks = await query(provider()).getTasksByCategoryPaginated(catId, offset, limit);
    console.log(JSON.stringify({ categoryId: catId, count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },
  async count() {
    const c = await query(provider()).getActiveTaskCount();
    console.log(JSON.stringify({ activeTasks: c.toString() }));
  },
  async "user-tasks"(addr) {
    const p = provider();
    const [created, participated] = await Promise.all([
      core(p).getUserCreatedTasks(addr),
      core(p).getUserParticipatedTasks(addr)
    ]);
    console.log(JSON.stringify({
      address: addr,
      created: created.map(i=>i.toString()),
      participated: participated.map(i=>i.toString())
    }, null, 2));
  },
  async bids(taskId) {
    const all = await bidding(provider()).getAllBids(taskId);
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
    if (!tokenAddr || tokenAddr === "native") {
      const bal = await p.getBalance(addr);
      console.log(JSON.stringify({ address: addr, token: "OKB", balance: ethers.formatEther(bal) }));
    } else {
      const tok = erc20(tokenAddr, p);
      const [bal, sym, dec] = await Promise.all([tok.balanceOf(addr), tok.symbol(), tok.decimals()]);
      console.log(JSON.stringify({ address: addr, token: sym, tokenAddress: tokenAddr, balance: ethers.formatUnits(bal, dec) }));
    }
  },

  // ---- WRITE ----
  async create(jsonStr) {
    const o = JSON.parse(jsonStr);
    const s = signer();
    const tokenAddress = o.tokenAddress || ethers.ZeroAddress;
    const bountyWei = ethers.parseEther(o.bountyPerUser.toString());
    const total = bountyWei * BigInt(o.maxParticipants);
    if (tokenAddress !== ethers.ZeroAddress) {
      const tok = erc20(tokenAddress, s);
      const allowance = await tok.allowance(s.address, CONTRACTS.contracts.core);
      if (allowance < total) {
        console.error(JSON.stringify({ step: "approve", msg: "Approving token..." }));
        const tx = await tok.approve(CONTRACTS.contracts.core, total * 2n);
        await tx.wait();
        console.error(JSON.stringify({ step: "approved", txHash: tx.hash }));
      }
    }
    const tx = await core(s).createTask(
      o.title, o.description, o.taskType||0,
      bountyWei, o.maxParticipants,
      o.startTime, o.endTime,
      o.requirements||'', tokenAddress, o.categoryId||1,
      { value: tokenAddress === ethers.ZeroAddress ? total : 0n }
    );
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async participate(taskId) {
    const tx = await core(signer()).participateTask(taskId);
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async submit(taskId, proofHash, metadata) {
    const tx = await core(signer()).submitTask(taskId, proofHash||'', metadata||'');
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async approve(taskId, participant) {
    const tx = await core(signer()).approveSubmission(taskId, participant);
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async "batch-approve"(taskId, jsonAddrs) {
    const addrs = JSON.parse(jsonAddrs);
    const tx = await core(signer()).batchApprove(taskId, addrs);
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async reject(taskId, participant, reason) {
    const tx = await core(signer()).rejectSubmission(taskId, participant, reason||'');
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async cancel(taskId) {
    const tx = await core(signer()).cancelTask(taskId);
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async "submit-bid"(taskId, bidAmount, proposal, contactInfo) {
    const s = signer();
    const bidWei = ethers.parseEther(bidAmount.toString());
    const tx = await bidding(s).submitBid(taskId, bidWei, proposal||'', contactInfo||'');
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async "cancel-bid"(taskId) {
    const tx = await bidding(signer()).cancelBid(taskId);
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async "select-bidder"(taskId, bidderAddr) {
    const tx = await bidding(signer()).selectBidder(taskId, bidderAddr);
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },
  async "approve-token"(tokenAddr, amount) {
    const s = signer();
    const tok = erc20(tokenAddr, s);
    const tx = await tok.approve(CONTRACTS.contracts.core, ethers.parseEther(amount.toString()));
    const r = await tx.wait();
    console.log(JSON.stringify({ success:true, txHash:tx.hash, block:r.blockNumber }));
  },

  // ---- BUILD UNSIGNED TX ----
  async "build-tx"(cmd, jsonArgs) {
    const args = JSON.parse(jsonArgs);
    const p = provider();
    let to, data;
    const coreIface    = new ethers.Interface(ABIS.BountyPlatformCore);
    const biddingIface = new ethers.Interface(ABIS.BountyPlatformBidding);
    const erc20Iface   = new ethers.Interface(ABIS.ERC20);
    switch(cmd) {
      case 'createTask':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('createTask', [
          args.title, args.description, args.taskType||0,
          ethers.parseEther(args.bountyPerUser.toString()), args.maxParticipants,
          args.startTime, args.endTime, args.requirements||'',
          args.tokenAddress||ethers.ZeroAddress, args.categoryId||1
        ]); break;
      case 'participateTask':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('participateTask', [args.taskId]); break;
      case 'submitTask':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('submitTask', [args.taskId, args.proofHash||'', args.metadata||'']); break;
      case 'approveSubmission':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('approveSubmission', [args.taskId, args.participant]); break;
      case 'rejectSubmission':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('rejectSubmission', [args.taskId, args.participant, args.reason||'']); break;
      case 'cancelTask':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('cancelTask', [args.taskId]); break;
      case 'submitBid':
        to   = CONTRACTS.contracts.bidding;
        data = biddingIface.encodeFunctionData('submitBid', [args.taskId, ethers.parseEther(args.bidAmount.toString()), args.proposal||'', args.contactInfo||'']); break;
      case 'selectBidder':
        to   = CONTRACTS.contracts.bidding;
        data = biddingIface.encodeFunctionData('selectBidder', [args.taskId, args.bidder]); break;
      case 'approveToken':
        to   = args.tokenAddress;
        data = erc20Iface.encodeFunctionData('approve', [CONTRACTS.contracts.core, ethers.parseEther(args.amount.toString())]); break;
      default:
        console.error(JSON.stringify({ error: 'Unknown build-tx command: ' + cmd })); process.exit(1);
    }
    const feeData = await p.getFeeData();
    const nonce   = args.from ? await p.getTransactionCount(args.from) : undefined;
    console.log(JSON.stringify({
      unsignedTx: { to, data, chainId: CONTRACTS.chainId, gasPrice: feeData.gasPrice?.toString(), nonce },
      note: 'Sign with your wallet and broadcast'
    }, null, 2));
  }
};

// shorthand aliases
cmds.join = cmds.participate;

const [,,cmd,...rest] = process.argv;
(async () => {
  if (!cmd || !cmds[cmd]) {
    console.log(`
Niuma Bounty Platform CLI  (task.niuma.works / XLayer testnet)

READ (no key needed):
  task <id>                          Task details
  list [offset] [limit]              Active tasks
  paginated [offset] [limit]         All tasks paginated
  pending [offset] [limit]           Tasks under review
  by-status <status> [off] [limit]   Tasks by status (0-7)
  by-category <catId> [off] [limit]  Tasks by category
  count                              Active task count
  user-tasks <addr>                  Created & participated tasks
  bids <taskId>                      All bids for a task
  balance <addr> [tokenAddr]         Wallet balance

WRITE (needs NIUMA_PRIVATE_KEY env):
  create '<json>'          Create task
  join <taskId>            Participate in task
  submit <id> <proof> [meta]  Submit work
  approve <id> <addr>      Approve submission
  batch-approve <id> '[addrs]'  Batch approve
  reject <id> <addr> <reason>  Reject submission
  cancel <taskId>          Cancel task
  submit-bid <id> <amt> <proposal> [contact]  Place bid
  cancel-bid <taskId>      Cancel bid
  select-bidder <id> <addr>  Select winning bid
  approve-token <token> <amt>  Approve ERC20

BUILD UNSIGNED TX:
  build-tx <cmd> '<json>'  Build calldata for wallet signing
  Commands: createTask participateTask submitTask approveSubmission
            rejectSubmission cancelTask submitBid selectBidder approveToken

ENV:
  NIUMA_PRIVATE_KEY   Private key for write ops
  NIUMA_RPC           Override RPC (default: https://xlayertestrpc.okx.com)
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
