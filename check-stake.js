const ethers = require('ethers');
const fs = require('fs');

const RPC_URL = 'https://xlayertestrpc.okx.com';
const contracts = JSON.parse(fs.readFileSync('./references/contracts.json', 'utf8')).contracts;
const USER_PROFILE_CREDIT = contracts.userProfileCredit;

const ABI = [
    "function hunterStake(address) view returns (uint256)",
    "function lockedStake(address) view returns (uint256)",
    "function calculateNiumaStake(address token, uint256 amount) view returns (uint256)"
];

async function checkStake() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(USER_PROFILE_CREDIT, ABI, provider);
    
    const address = '0x96b5dffd481dc55031a7815C5dBcf39B17Be62bb';
    const niumaToken = contracts.niumaToken;
    
    console.log('========================================');
    console.log('💎 查询押金状态');
    console.log('========================================\n');
    
    console.log('👛 地址:', address);
    console.log('📋 UserProfileCredit:', USER_PROFILE_CREDIT);
    
    try {
        const hunterStake = await contract.hunterStake(address);
        const lockedStake = await contract.lockedStake(address);
        const availableStake = hunterStake - lockedStake;
        
        console.log('\n【押金信息】');
        console.log('  总押金 (hunterStake):', ethers.formatEther(hunterStake), 'NIUMA');
        console.log('  锁定押金 (lockedStake):', ethers.formatEther(lockedStake), 'NIUMA');
        console.log('  可用押金:', ethers.formatEther(availableStake), 'NIUMA');
        
        // 计算接单需要的押金
        const bountyAmount = ethers.parseEther('100'); // 任务1的赏金
        const requiredStake = await contract.calculateNiumaStake(niumaToken, bountyAmount);
        console.log('\n【任务1需求】');
        console.log('  任务赏金:', ethers.formatEther(bountyAmount), 'NIUMA');
        console.log('  需要押金:', ethers.formatEther(requiredStake), 'NIUMA');
        console.log('  押金是否足够:', availableStake >= requiredStake ? '✅ 是' : '❌ 否');
        
    } catch (error) {
        console.log('❌ 查询失败:', error.message);
    }
}

checkStake().catch(console.error);
