#!/usr/bin/env node
/**
 * niuma.js - Niuma Bounty Platform CLI
 * Pure Node.js, zero dependencies. Read-only chain queries via JSON-RPC.
 * Write operations: see SKILL.md for ABI specs and calldata.
 */

const CONF = require("../references/contracts.json");

const RPC = process.env.NIUMA_RPC || CONF.rpc;

const STATUS = {0:"Pending",1:"Open",2:"InProgress",3:"UnderReview",4:"Completed",5:"Disputed",6:"Cancelled",7:"Rejected"};
const TYPE   = {0:"Normal",1:"Bidding"};

const SEL = {
  getActiveTaskCount:          '5c41a3af',
  getTaskCounter:              'c4c88ee3',
  getTaskInfo:                 'd1a1b999',
  getTaskStatus:               '5290900b',
  getUserCreatedTasks:         '226433b6',
  getUserParticipatedTasks:    '7b67db87',
  getTaskParticipants:         '7869099c',
  getActiveTasks:              'ac5f2f1f',
  getPendingReviewTasks:       '272f6fdc',
  getTasksPaginated:           '9e7081a6',
  getActiveTaskIds:            'a647e540',
  getPendingReviewTaskIds:     '9e743226',
  getTaskIdsByStatusPaginated: '75a045a8',
  getAllBids:                   'a528ff83',
  getTaskBidders:              'a5fec132',
  balanceOf:                   '70a08231',
  symbol:                      '95d89b41',
  decimals:                    '313ce567',
  allowance:                   'dd62ed3e',
};

function padUint(n)  { return BigInt(n).toString(16).padStart(64,'0'); }
function padAddr(a)  { return a.toLowerCase().replace('0x','').padStart(64,'0'); }

async function rpc(method, params) {
  const res  = await fetch(RPC, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({jsonrpc:'2.0',id:1,method,params})
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function call(to, sel, params='') {
  return rpc('eth_call', [{to, data:'0x'+sel+params},'latest']);
}

function fmtEther(wei) {
  const n = Number(BigInt(wei)) / 1e18;
  return n % 1 === 0 ? n.toString() : n.toFixed(6).replace(/\.?0+$/,'');
}

function fmtTs(sec) {
  const n = BigInt(sec);
  return n === 0n ? null : new Date(Number(n)*1000).toISOString();
}

// Decode a task tuple starting at word `base` in raw hex string (no 0x prefix)
function decodeTask(raw, base) {
  function w(i)   { return raw.slice((base+i)*64, (base+i+1)*64); }
  function wu(i)  { return BigInt('0x'+w(i)); }
  function wa(i)  { return '0x'+w(i).slice(24); }
  function wb(i)  { return wu(i) !== 0n; }
  // string pointer is a byte offset from the START of the full raw buffer
  function ws(ptrIdx) {
    const byteOff = Number(wu(ptrIdx));
    const wordOff = byteOff / 32 + base; // absolute word index
    const len     = Number(BigInt('0x'+raw.slice(wordOff*64,(wordOff+1)*64)));
    if (len === 0) return '';
    const hex = raw.slice((wordOff+1)*64, (wordOff+1)*64 + len*2);
    return Buffer.from(hex,'hex').toString('utf8');
  }
  const token = wa(18);
  return {
    id:                  wu(0).toString(),
    creator:             wa(1),
    hunter:              wa(2),
    title:               ws(3),
    description:         ws(4),
    bountyPerUser:       fmtEther(wu(5)),
    totalBounty:         fmtEther(wu(6)),
    maxParticipants:     wu(7).toString(),
    currentParticipants: wu(8).toString(),
    startTime:           fmtTs(wu(9)),
    endTime:             fmtTs(wu(10)),
    taskType:            TYPE[Number(wu(11))] || wu(11).toString(),
    status:              STATUS[Number(wu(12))] || wu(12).toString(),
    disputeStatus:       wu(13).toString(),
    requirements:        ws(14),
    createdAt:           fmtTs(wu(15)),
    completedAt:         fmtTs(wu(16)),
    isRefunded:          wb(17),
    token:               token === '0x0000000000000000000000000000000000000000' ? 'OKB(native)' : token,
    categoryId:          wu(19).toString(),
    isPaused:            wb(20)
  };
}

// getTaskInfo returns: word0=0x20 (outer tuple offset), then tuple at word1
function decodeSingleTask(hex) {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  // word0 is byte offset to tuple start = 0x20 = 32 bytes = word 1
  return decodeTask(raw, 1);
}

// getActiveTasks etc returns: word0=offset_to_array, array_len, [elem_offsets...], ...data
function decodeTaskArray(hex) {
  const raw    = hex.startsWith('0x') ? hex.slice(2) : hex;
  const arrOff = Number(BigInt('0x'+raw.slice(0,64))) / 32; // word index of array
  const arrLen = Number(BigInt('0x'+raw.slice(arrOff*64,(arrOff+1)*64)));
  const tasks  = [];
  for (let i = 0; i < arrLen; i++) {
    // element offset is relative to start of array data (word arrOff+1)
    const elemByteOff = Number(BigInt('0x'+raw.slice((arrOff+1+i)*64,(arrOff+2+i)*64)));
    const base = arrOff + 1 + elemByteOff/32;
    tasks.push(decodeTask(raw, base));
  }
  return tasks;
}

function decodeUintArray(hex) {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  // word0=offset, word1=len, word2..=data  OR  word0=len, word1..=data
  // eth_call for dynamic array: word0=0x20, word1=len
  const len = Number(BigInt('0x'+raw.slice(64,128)));
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(BigInt('0x'+raw.slice(128+i*64, 128+(i+1)*64)).toString());
  }
  return out;
}

const cmds = {
  async contracts() {
    console.log(JSON.stringify(CONF, null, 2));
  },

  async count() {
    const r = await call(CONF.contracts.queryHelper, SEL.getActiveTaskCount);
    console.log(JSON.stringify({ activeTasks: BigInt(r).toString() }));
  },

  async task(id) {
    const r = await call(CONF.contracts.core, SEL.getTaskInfo, padUint(id));
    console.log(JSON.stringify(decodeSingleTask(r), null, 2));
  },

  async status(id) {
    const r = await call(CONF.contracts.core, SEL.getTaskStatus, padUint(id));
    const n = Number(BigInt(r));
    console.log(JSON.stringify({ taskId: id, status: n, statusText: STATUS[n]||'Unknown' }));
  },

  async list(offset=0, limit=20) {
    const r     = await call(CONF.contracts.queryHelper, SEL.getActiveTasks, padUint(offset)+padUint(limit));
    const tasks = decodeTaskArray(r);
    console.log(JSON.stringify({ count: tasks.length, tasks }, null, 2));
  },

  async pending(offset=0, limit=20) {
    const r     = await call(CONF.contracts.queryHelper, SEL.getPendingReviewTasks, padUint(offset)+padUint(limit));
    const tasks = decodeTaskArray(r);
    console.log(JSON.stringify({ count: tasks.length, tasks }, null, 2));
  },

  async paginated(offset=0, limit=20) {
    const r     = await call(CONF.contracts.queryHelper, SEL.getTasksPaginated, padUint(offset)+padUint(limit));
    const tasks = decodeTaskArray(r);
    console.log(JSON.stringify({ count: tasks.length, tasks }, null, 2));
  },

  async 'by-status'(status, offset=0, limit=20) {
    const r   = await call(CONF.contracts.queryHelper, SEL.getTaskIdsByStatusPaginated, padUint(status)+padUint(offset)+padUint(limit));
    const ids = decodeUintArray(r);
    console.log(JSON.stringify({ status: STATUS[Number(status)]||status, ids }));
  },

  async 'user-tasks'(addr) {
    const [cr, pr] = await Promise.all([
      call(CONF.contracts.core, SEL.getUserCreatedTasks,      padAddr(addr)),
      call(CONF.contracts.core, SEL.getUserParticipatedTasks, padAddr(addr))
    ]);
    console.log(JSON.stringify({
      address: addr,
      created:      decodeUintArray(cr),
      participated: decodeUintArray(pr)
    }, null, 2));
  },

  async balance(addr, tokenAddr) {
    if (!tokenAddr || tokenAddr === 'native') {
      const r = await rpc('eth_getBalance', [addr,'latest']);
      console.log(JSON.stringify({ address: addr, token: 'OKB', balance: fmtEther(BigInt(r)) }));
    } else {
      const [balR, decR, symR] = await Promise.all([
        call(tokenAddr, SEL.balanceOf, padAddr(addr)),
        call(tokenAddr, SEL.decimals),
        call(tokenAddr, SEL.symbol)
      ]);
      const dec = Number(BigInt(decR));
      const bal = Number(BigInt(balR)) / Math.pow(10, dec);
      // symbol: word0=offset(0x20), word1=len, word2=data
      const symRaw = (symR.startsWith('0x') ? symR.slice(2) : symR);
      const symLen = Number(BigInt('0x'+symRaw.slice(64,128)));
      const sym    = Buffer.from(symRaw.slice(128, 128+symLen*2),'hex').toString('utf8');
      console.log(JSON.stringify({ address: addr, token: sym, tokenAddress: tokenAddr, balance: bal.toFixed(6) }));
    }
  },

  async allowance(ownerAddr, tokenAddr) {
    const [valR, decR] = await Promise.all([
      call(tokenAddr, SEL.allowance, padAddr(ownerAddr)+padAddr(CONF.contracts.core)),
      call(tokenAddr, SEL.decimals)
    ]);
    const dec = Number(BigInt(decR));
    const val = Number(BigInt(valR)) / Math.pow(10, dec);
    console.log(JSON.stringify({ owner: ownerAddr, spender: CONF.contracts.core, allowance: val.toFixed(6) }));
  }
};

const [,,cmd,...rest] = process.argv;
(async () => {
  if (!cmd || !cmds[cmd]) {
    console.log(`
Niuma Bounty Platform CLI  -  task.niuma.works / XLayer
Zero dependencies. Read-only. Write ops documented in SKILL.md.

COMMANDS:
  contracts                             All contract addresses
  count                                 Active task count
  task <id>                             Task details
  status <id>                           Task status
  list [offset] [limit]                 Active tasks
  pending [offset] [limit]              Tasks under review
  paginated [offset] [limit]            All tasks
  by-status <0-7> [offset] [limit]      Tasks by status
  user-tasks <address>                  Tasks by user
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
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
})();
