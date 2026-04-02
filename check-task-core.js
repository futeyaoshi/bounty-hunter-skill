const ethers = require('ethers');

const RPC_URL = 'https://xlayertestrpc.okx.com';
const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';

// Core Contract ABI - getTask 函数
const CORE_ABI = [
    "function getTask(uint256 taskId) external view returns (tuple(uint256 taskId, address creator, string title, string description, string requirements, uint8 taskType, uint256 bountyPerUser, uint256 maxParticipants, uint256 currentParticipants, uint8 status, uint256 startTime, uint256 endTime, address tokenAddress, uint256 categoryId))"
];

async function checkTask(taskId) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    
    const core = new ethers.Contract(CORE_CONTRACT, CORE_ABI, provider);
    
    console.log('========================================');
    console.log(`📋 任务 ${taskId} 详细参数`);
    console.log('========================================\n');
    
    try {
        const task = await core.getTask(taskId);
        
        console.log('【基本信息】');
        console.log('  ID:', task.taskId.toString());
        console.log('  创建者:', task.creator);
        console.log('  标题:', task.title);
        console.log('  描述:', task.description);
        console.log('  要求:', task.requirements);
        
        console.log('\n【类型和状态】');
        console.log('  类型:', task.taskType.toString(), '(0=Normal, 1=Bidding)');
        console.log('  状态:', task.status.toString(), '(0=Pending, 1=Open, 2=InProgress, 3=UnderReview, 4=Completed, 5=Disputed, 6=Cancelled, 7=Rejected)');
        
        console.log('\n【奖励和人数】');
        console.log('  赏金/人:', ethers.utils.formatEther(task.bountyPerUser), 'NIUMA');
        console.log('  最大人数:', task.maxParticipants.toString());
        console.log('  当前人数:', task.currentParticipants.toString());
        
        console.log('\n【时间和代币】');
        console.log('  开始时间:', new Date(task.startTime.toNumber() * 1000).toLocaleString());
        console.log('  结束时间:', new Date(task.endTime.toNumber() * 1000).toLocaleString());
        console.log('  Token地址:', task.tokenAddress);
        console.log('  分类ID:', task.categoryId.toString());
        
    } catch (error) {
        console.log('❌ 查询失败:', error.message);
    }
}

const taskId = process.argv[2] || '1';
checkTask(taskId).catch(console.error);
