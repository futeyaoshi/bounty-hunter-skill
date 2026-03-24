#!/usr/bin/env node
/**
 * niuma.js - Niuma Bounty Platform CLI
 * task.niuma.works on XLayer (Chain ID: 1952)
 * 
 * READ: query tasks, bids, balances directly from chain
 * BUILD-TX: construct unsigned calldata for wallet plugins to sign
 */
const { ethers } = require("ethers");
const CONTRACTS = require("../references/contracts.json");
const ABIS = require("../references/abis.json");

const STATUS = { 0:"Pending",1:"Open",2:"InProgress",3:"UnderReview",4:"Completed",5:"Disputed",6:"Cancelled",7:"Rejected" };
const TYPE   = { 0:"Normal",1:"Bidding" };

function getProvider() {
  return new ethers.JsonRpcProvider(process.env.NIUMA_RPC || CONTRACTS.rpc);
}

const core    = () => new ethers.Contract(CONTRACTS.contracts.core,       ABIS.BountyPlatformCore,    getProvider());
const query   = () => new ethers.Contract(CONTRACTS.contracts.queryHelper, ABIS.BountyQueryHelper,     getProvider());
const bidding = () => new ethers.Contract(CONTRACTS.contracts.bidding,     ABIS.BountyPlatformBidding, getProvider());

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
  // ======== READ OPERATIONS ========

  async task(id) {
    const t = await core().getTaskInfo(id);
    console.log(JSON.stringify(fmt(t), null, 2));
  },

  async list(offset=0, limit=20) {
    const tasks = await query().getActiveTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, offset, limit, tasks: tasks.map(fmt) }, null, 2));
  },

  async pending(offset=0, limit=20) {
    const tasks = await query().getPendingReviewTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async paginated(offset=0, limit=20) {
    const tasks = await query().getTasksPaginated(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async "by-status"(status, offset=0, limit=20) {
    const ids = await query().getTaskIdsByStatusPaginated(status, offset, limit);
    console.log(JSON.stringify({ status: STATUS[status]||status, ids: ids.map(i=>i.toString()) }, null, 2));
  },

  async "by-category"(catId, offset=0, limit=20) {
    const tasks = await query().getTasksByCategoryPaginated(catId, offset, limit);
    console.log(JSON.stringify({ categoryId: catId, count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async count() {
    const c = await query().getActiveTaskCount();
    console.log(JSON.stringify({ activeTasks: c.toString() }));
  },

  async "user-tasks"(addr) {
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
    const p = getProvider();
    if (!tokenAddr || tokenAddr === "native") {
      const bal = await p.getBalance(addr);
      console.log(JSON.stringify({ address: addr, token: "OKB", balance: ethers.formatEther(bal) }));
    } else {
      const tok = new ethers.Contract(tokenAddr, ABIS.ERC20, p);
      const [bal, sym, dec] = await Promise.all([tok.balanceOf(addr), tok.symbol(), tok.decimals()]);
      console.log(JSON.stringify({ address: addr, token: sym, tokenAddress: tokenAddr, balance: ethers.formatUnits(bal, dec) }));
    }
  },

  async allowance(ownerAddr, tokenAddr) {
    const tok = new ethers.Contract(tokenAddr, ABIS.ERC20, getProvider());
    const [allowance, sym, dec] = await Promise.all([tok.allowance(ownerAddr, CONTRACTS.contracts.core), tok.symbol(), tok.decimals()]);
    console.log(JSON.stringify({ owner: ownerAddr, spender: CONTRACTS.contracts.core, token: sym, allowance: ethers.formatUnits(allowance, dec) }));
  },

  // ======== BUILD UNSIGNED TX (for wallet plugins to sign) ========

  async "build-tx"(cmd, jsonArgs) {
    const args = JSON.parse(jsonArgs);
    const p = getProvider();
    const coreIface    = new ethers.Interface(ABIS.BountyPlatformCore);
    const biddingIface = new ethers.Interface(ABIS.BountyPlatformBidding);
    const erc20Iface   = new ethers.Interface(ABIS.ERC20);
    let to, data, value = "0";

    switch(cmd) {
      case 'createTask': {
        const bountyWei = ethers.parseEther(args.bountyPerUser.toString());
        const total = bountyWei * BigInt(args.maxParticipants);
        const tokenAddr = args.tokenAddress || ethers.ZeroAddress;
        to   = CONTRACTS.contracts.core;
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
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('participateTask', [args.taskId]); break;
      case 'submitTask':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('submitTask', [args.taskId, args.proofHash||'', args.metadata||'']); break;
      case 'approveSubmission':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('approveSubmission', [args.taskId, args.participant]); break;
      case 'batchApprove':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('batchApprove', [args.taskId, args.participants]); break;
      case 'rejectSubmission':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('rejectSubmission', [args.taskId, args.participant, args.reason||'']); break;
      case 'cancelTask':
        to   = CONTRACTS.contracts.core;
        data = coreIface.encodeFunctionData('cancelTask', [args.taskId]); break;
      case 'submitBid':
        to   = CONTRACTS.contracts.bidding;
        data = biddingIface.encodeFunctionData('submitBid', [args.taskId, ethers.parseEther(args.bidAmount.toString()), args.proposal||'', args.contactInfo||'']); break;
      case 'cancelBid':
        to   = CONTRACTS.contracts.bidding;
        data = biddingIface.encodeFunctionData('cancelBid', [args.taskId]); break;
      case 'selectBidder':
        to   = CONTRACTS.contracts.bidding;
        data = biddingIface.encodeFunctionData('selectBidder', [args.taskId, args.bidder]); break;
      case 'approveToken':
        to   = args.tokenAddress;
        data = erc20Iface.encodeFunctionData('approve', [CONTRACTS.contracts.core, ethers.parseEther(args.amount.toString())]); break;
      default:
        console.error(JSON.stringify({ error: 'Unknown command: ' + cmd })); process.exit(1);
    }

    const feeData = await p.getFeeData();
    const nonce   = args.from ? await p.getTransactionCount(args.from) : undefined;
    console.log(JSON.stringify({
      unsignedTx: {
        to, data, value,
        chainId: CONTRACTS.chainId,
        gasPrice: feeData.gasPrice?.toString(),
        nonce
      },
      description: `${cmd} on Niuma Bounty Platform`,
      chain: CONTRACTS.network
    }, null, 2));
  }
};

const [,,cmd,...rest] = process.argv;
(async () => {
  if (!cmd || !cmds[cmd]) {
    console.log(`
Niuma Bounty Platform CLI  —  task.niuma.works / XLayer testnet
Read-only queries + unsigned transaction builder for wallet plugins.

READ (no credentials needed):
  task <id>                           Task details
  list [offset] [limit]               Active tasks
  paginated [offset] [limit]          All tasks paginated
  pending [offset] [limit]            Tasks under review
  by-status <0-7> [offset] [limit]    Tasks by status
  by-category <catId> [offset] [limit] Tasks by category
  count                               Active task count
  user-tasks <address>                Created & participated tasks
  bids <taskId>                       All bids for a task
  balance <address> [tokenAddress]    Wallet balance (OKB or ERC20)
  allowance <address> <tokenAddress>  ERC20 allowance for Core contract

BUILD UNSIGNED TX (pass result to wallet plugin for signing):
  build-tx <command> '<json>'

  Commands:
    createTask         title description taskType bountyPerUser maxParticipants startTime endTime requirements tokenAddress categoryId
    participateTask    taskId
    submitTask         taskId proofHash [metadata]
    approveSubmission  taskId participant
    batchApprove       taskId participants[]
    rejectSubmission   taskId participant [reason]
    cancelTask         taskId
    submitBid          taskId bidAmount proposal [contactInfo]
    cancelBid          taskId
    selectBidder       taskId bidder
    approveToken       tokenAddress amount

  Example:
    node niuma.js build-tx participateTask '{"taskId":3,"from":"0x..."}'
    node niuma.js build-tx createTask '{"title":"Test","description":"...","taskType":0,"bountyPerUser":"10","maxParticipants":3,"startTime":1711900800,"endTime":1712505600,"tokenAddress":"0x0000000000000000000000000000000000000000","categoryId":1}'

ENV:
  NIUMA_RPC   Override RPC URL (default: https://xlayertestrpc.okx.com)
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
