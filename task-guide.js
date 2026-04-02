const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';
const NIUMA_TOKEN = '0x49ABB6BFFEce92EAd9E71BCA930Ac877ef71939D';

// ERC20 ABI
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)",
    "function transfer(address recipient, uint256 amount) public returns (bool)"
];

// Core Contract ABI (部分)
const CORE_ABI = [
    "function participateTask(uint256 taskId) external",
    "function getTask(uint256 taskId) external view returns (tuple(uint256 taskId, address creator, string title, string description, uint256 bounty, uint256 maxParticipants, uint256 currentParticipants, uint8 status, uint8 taskType, uint256 startTime, uint256 endTime, address[] participants))",
    "function userTaskInfo(address user, uint256 taskId) external view returns (tuple(uint256 joinTime, uint8 status, string proof))"
];

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('🎯 Niuma Bounty 任务接单脚本（带押金说明）');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 查询余额
    const okbBalance = await provider.getBalance(wallet.address);
    console.log('💰 OKB 余额:', ethers.utils.formatEther(okbBalance));
    
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    const niumaBalance = await token.balanceOf(wallet.address);
    console.log('💎 NIUMA 余额:', ethers.utils.formatEther(niumaBalance));
    
    // 查询授权额度
    const allowance = await token.allowance(wallet.address, CORE_CONTRACT);
    console.log('🔓 已授权额度:', ethers.utils.formatEther(allowance), 'NIUMA\n');
    
    console.log('========================================');
    console.log('📋 押金/质押说明');
    console.log('========================================');
    console.log('1. 部分任务可能需要质押 NIUMA Token 作为押金');
    console.log('2. 任务完成后，押金会返还');
    console.log('3. 如果任务失败或违规，押金可能被扣除');
    console.log('4. 当前授权额度:', ethers.utils.formatEther(allowance), 'NIUMA');
    console.log('5. 建议授权额度: 1000-10000 NIUMA（根据任务要求）\n');
    
    // 检查是否需要授权
    const requiredAllowance = ethers.utils.parseEther('1000');
    if (allowance.lt(requiredAllowance)) {
        console.log('⚠️  授权额度不足，需要先授权 Token\n');
        console.log('正在授权 10000 NIUMA...');
        
        const approveTx = await token.approve(CORE_CONTRACT, ethers.utils.parseEther('10000'));
        console.log('✅ 授权交易已发送:', approveTx.hash);
        await approveTx.wait();
        console.log('✅ 授权成功!\n');
    }
    
    // 任务列表
    const tasks = [
        { id: 1, name: '测试任务', bounty: 100 },
        { id: 2, name: '推特001', bounty: 100 },
        { id: 3, name: '发红包', bounty: 200 },
        { id: 5, name: '发言', bounty: 100 },
        { id: 6, name: '暴打do', bounty: 100 },
        { id: 9, name: '牛马破冰', bounty: 100 },
        { id: 10, name: 'ok星球发布邀请信息', bounty: 100 },
        { id: 11, name: '发布推文带$niuma', bounty: 300 }
    ];
    
    console.log('========================================');
    console.log('📋 可接任务列表');
    console.log('========================================');
    tasks.forEach((task, index) => {
        console.log(`${index + 1}. 任务 ${task.id}: ${task.name} (${task.bounty} NIUMA)`);
    });
    
    console.log('\n⚠️  注意：任务 5 之前接单失败，可能原因：');
    console.log('   - 任务创建者设置了白名单');
    console.log('   - 需要特定条件（如最低贡献值）');
    console.log('   - 任务已满员\n');
    
    console.log('========================================');
    console.log('📝 操作建议');
    console.log('========================================');
    console.log('1. 先尝试任务 1、6、9、10、11（普通任务）');
    console.log('2. 确保有足够的 NIUMA Token');
    console.log('3. 确保已授权足够的额度');
    console.log('4. 如果仍然失败，可能需要联系任务创建者\n');
    
    console.log('要尝试接特定任务，请运行：');
    console.log('  node join-task-specific.js <任务ID>');
    console.log('\n例如：');
    console.log('  node join-task-specific.js 9');
}

main().catch(console.error);
