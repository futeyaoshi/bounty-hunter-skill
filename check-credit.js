const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const USER_PROFILE_CREDIT = '0x6CcDefaa116E17f19AC3A28d24f4b0C4a83C7B45';
const NIUMA_TOKEN = '0x49ABB6BFFEce92EAd9E71BCA930Ac877ef71939D';
const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';

// UserProfileCredit ABI (常见函数)
const USER_PROFILE_ABI = [
    "function getUserCredit(address user) external view returns (uint256)",
    "function depositCollateral(uint256 amount) external",
    "function withdrawCollateral(uint256 amount) external",
    "function getRequiredCollateral() external view returns (uint256)",
    "function hasEnoughCredit(address user) external view returns (bool)"
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('💎 用户信用/押金系统查询');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    const userProfile = new ethers.Contract(USER_PROFILE_CREDIT, USER_PROFILE_ABI, wallet);
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 查询余额
    const niumaBalance = await token.balanceOf(wallet.address);
    console.log('💰 NIUMA 余额:', ethers.utils.formatEther(niumaBalance));
    
    // 查询用户信用
    try {
        const credit = await userProfile.getUserCredit(wallet.address);
        console.log('💎 当前信用/押金:', ethers.utils.formatEther(credit), 'NIUMA');
    } catch (e) {
        console.log('💎 当前信用/押金: 无法查询 (', e.message.slice(0, 50), ')');
    }
    
    // 查询所需最低押金
    try {
        const required = await userProfile.getRequiredCollateral();
        console.log('📋 所需最低押金:', ethers.utils.formatEther(required), 'NIUMA');
    } catch (e) {
        console.log('📋 所需最低押金: 无法查询 (', e.message.slice(0, 50), ')');
    }
    
    // 查询是否有足够信用
    try {
        const hasEnough = await userProfile.hasEnoughCredit(wallet.address);
        console.log('✅ 信用是否足够:', hasEnough ? '是' : '否');
    } catch (e) {
        console.log('✅ 信用是否足够: 无法查询');
    }
    
    console.log('\n========================================');
    console.log('📝 押金操作选项');
    console.log('========================================');
    console.log('1. 充值押金 - 需要先授权 Token');
    console.log('2. 提取押金');
    console.log('3. 查看合约详情');
    
    console.log('\n⚠️  注意：如果接单失败可能是因为：');
    console.log('   - 信用/押金不足');
    console.log('   - 需要达到最低押金要求');
    console.log('   - 任务创建者设置了白名单');
    
    console.log('\n要充值押金，运行：');
    console.log('  node deposit-collateral.js <金额>');
    console.log('例如：');
    console.log('  node deposit-collateral.js 1000');
}

main().catch(console.error);
