const ethers = require('ethers');

const RPC_URL = 'https://xlayertestrpc.okx.com';
const QUERY_HELPER = '0x45f390AC7459ab31a23f14513dEbE9a59Dc06826';

// QueryHelper ABI
const QUERY_HELPER_ABI = [
    "function getTaskBasicInfo(uint256 taskId) external view returns (uint256 id, address creator, string memory title, string memory description, uint8 status, uint8 taskType)",
    "function getTaskRequirements(uint256 taskId) external view returns (string memory requirements, uint256 maxParticipants, uint256 currentParticipants, uint256 completedCount)",
    "function getTaskRewards(uint256 taskId) external view returns (uint256 bountyPerUser, address tokenAddress, uint256 totalBounty, uint256 categoryId)"
];

async function checkTask(taskId) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    
    const queryHelper = new ethers.Contract(QUERY_HELPER, QUERY_HELPER_ABI, provider);
    
    console.log('========================================');
    console.log(`📋 任务 ${taskId} 详细参数`);
    console.log('========================================\n');
    
    try {
        // 基本信息
        const basic = await queryHelper.getTaskBasicInfo(taskId);
        console.log('【基本信息】');
        console.log('  ID:', basic.id.toString());
        console.log('  创建者:', basic.creator);
        console.log('  标题:', basic.title);
        console.log('  描述:', basic.description);
        console.log('  状态:', basic.status, '(0=Pending, 1=Open, 2=InProgress...)');
        console.log('  类型:', basic.taskType, '(0=Normal, 1=Bidding)');
        
        // 要求信息
        const req = await queryHelper.getTaskRequirements(taskId);
        console.log('\n【要求信息】');
        console.log('  要求:', req.requirements);
        console.log('  最大人数:', req.maxParticipants.toString());
        console.log('  当前人数:', req.currentParticipants.toString());
        console.log('  已完成:', req.completedCount.toString());
        
        // 奖励信息
        const reward = await queryHelper.getTaskRewards(taskId);
        console.log('\n【奖励信息】');
        console.log('  赏金/人:', ethers.utils.formatEther(reward.bountyPerUser), 'NIUMA');
        console.log('  Token地址:', reward.tokenAddress);
        console.log('  总赏金:', ethers.utils.formatEther(reward.totalBounty), 'NIUMA');
        console.log('  分类ID:', reward.categoryId.toString());
        
    } catch (error) {
        console.log('❌ 查询失败:', error.message);
    }
}

const taskId = process.argv[2] || '1';
checkTask(taskId).catch(console.error);
