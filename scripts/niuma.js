#!/usr/bin/env node
/**
 * niuma.js - Niuma Bounty Platform CLI
 * Read-only chain queries for task.niuma.works (XLayer)
 * Write operations: see SKILL.md for ABI specs and calldata.
 */

const { ethers } = require("ethers");
const CONF = require("../references/contracts.json");
const ABIS = require("../references/abis.json");

const STATUS = {0:"Pending",1:"Open",2:"InProgress",3:"UnderReview",4:"Completed",5:"Disputed",6:"Cancelled",7:"Rejected"};
const TYPE   = {0:"Normal",1:"Bidding"};

function provider() {
  const rpc = process.env.NIUMA_RPC || CONF.rpc;
  return new ethers.JsonRpcProvider(rpc);
}

function coreContract()    { return new ethers.Contract(CONF.contracts.core,        ABIS.BountyPlatformCore,    provider()); }
function queryContract()   { return new ethers.Contract(CONF.contracts.queryHelper,  ABIS.BountyQueryHelper,     provider()); }
function biddingContract() { return new ethers.Contract(CONF.contracts.bidding,      ABIS.BountyPlatformBidding, provider()); }
function tokenContract(a)  { return new ethers.Contract(a, ABIS.ERC20, provider()); }

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
    const c = await queryContract().getActiveTaskCount();
    console.log(JSON.stringify({ activeTasks: c.toString() }));
  },

  async task(id) {
    const t = await coreContract().getTaskInfo(id);
    console.log(JSON.stringify(fmt(t), null, 2));
  },

  async status(id) {
    const s = await coreContract().getTaskStatus(id);
    const n = Number(s);
    console.log(JSON.stringify({ taskId: id, status: n, statusText: STATUS[n]||'Unknown' }));
  },

  async list(offset=0, limit=20) {
    const tasks = await queryContract().getActiveTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async pending(offset=0, limit=20) {
    const tasks = await queryContract().getPendingReviewTasks(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async paginated(offset=0, limit=20) {
    const tasks = await queryContract().getTasksPaginated(offset, limit);
    console.log(JSON.stringify({ count: tasks.length, tasks: tasks.map(fmt) }, null, 2));
  },

  async "by-status"(status, offset=0, limit=20) {
    const ids = await queryContract().getTaskIdsByStatusPaginated(status, offset, limit);
    console.log(JSON.stringify({ status: STATUS[status]||status, ids: ids.map(i=>i.toString()) }));
  },

  async "user-tasks"(addr) {
    const [created, participated] = await Promise.all([
      coreContract().getUserCreatedTasks(addr),
      coreContract().getUserParticipatedTasks(addr)
    ]);
    console.log(JSON.stringify({
      address: addr,
      created: created.map(i=>i.toString()),
      participated: participated.map(i=>i.toString())
    }, null, 2));
  },

  async bids(taskId) {
    const all = await biddingContract().getAllBids(taskId);
    const result = all.map(b => ({
      bidder: b.bidder,
      bidAmount: ethers.formatEther(b.bidAmount),
      proposal: b.proposal,
      contactInfo: b.contactInfo,
      bidTime: new Date(Number(b.bidTime)*1000).toISOString(),
      isSelected: b.isSelected,
      isLost: b.isLost
    }));
    console.log(JSON.stringify({ taskId, bids: result }, null, 2));
  },

  async balance(addr, tokenAddr) {
    const p = provider();
    if (!tokenAddr || tokenAddr === 'native') {
      const bal = await p.getBalance(addr);
      console.log(JSON.stringify({ address: addr, token: 'OKB', balance: ethers.formatEther(bal) }));
    } else {
      const tok = tokenContract(tokenAddr);
      const [bal, sym, dec] = await Promise.all([tok.balanceOf(addr), tok.symbol(), tok.decimals()]);
      console.log(JSON.stringify({ address: addr, token: sym, tokenAddress: tokenAddr, balance: ethers.formatUnits(bal, dec) }));
    }
  },

  async allowance(ownerAddr, tokenAddr) {
    const tok = tokenContract(tokenAddr);
    const [val, sym, dec] = await Promise.all([
      tok.allowance(ownerAddr, CONF.contracts.core),
      tok.symbol(), tok.decimals()
    ]);
    console.log(JSON.stringify({ owner: ownerAddr, spender: CONF.contracts.core, token: sym, allowance: ethers.formatUnits(val, dec) }));
  }
};

const [,,cmd,...rest] = process.argv;
(async () => {
  if (!cmd || !cmds[cmd]) {
    console.log(`
Niuma Bounty Platform CLI  —  task.niuma.works / XLayer
Read-only queries. For write ops and calldata specs see SKILL.md.

COMMANDS:
  contracts                             All contract addresses
  count                                 Active task count
  task <id>                             Task details
  status <id>                           Task status
  list [offset] [limit]                 Active tasks
  pending [offset] [limit]              Tasks under review
  paginated [offset] [limit]            All tasks paginated
  by-status <0-7> [offset] [limit]      Tasks by status
  user-tasks <address>                  Tasks by user
  bids <taskId>                         Bids for a task
  balance <address> [tokenAddress]      Wallet balance
  allowance <address> <tokenAddress>    ERC20 allowance for Core

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
