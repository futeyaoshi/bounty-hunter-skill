const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const USER_PROFILE_CREDIT = '0x6CcDefaa116E17f19AC3A28d24f4b0C4a83C7B45';
const NIUMA_TOKEN = '0x49ABB6BFFEce92EAd9E71BCA930Ac877ef71939D';

const USER_PROFILE_ABI = [
    "function depositCollateral(uint256 amount) external",
    "function getUserCredit(address user) external view returns (uint256)"
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

async function depositCollateral(amount) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('💎 充值押金');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    console.log('💰 充值金额:', amount, 'NIUMA\n');
    
    const userProfile = new ethers.Contract(USER_PROFILE_CREDIT, USER_PROFILE_ABI, wallet);
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 检查余额
    const balance = await token.balanceOf(wallet.address);
    const depositAmount = ethers.utils.parseEther(amount.toString());
    
    if (balance.lt(depositAmount)) {
        console.log('❌ 余额不足！');
        console.log('  当前余额:', ethers.utils.formatEther(balance), 'NIUMA');
        console.log('  需要:', amount, 'NIUMA');
        return;
    }
    
    // 检查授权
    const allowance = await token.allowance(wallet.address, USER_PROFILE_CREDIT);
    console.log('🔓 当前授权额度:', ethers.utils.formatEther(allowance), 'NIUMA');
    
    if (allowance.lt(depositAmount)) {
        console.log('\n⚠️  授权额度不足，需要先授权...');
        const approveTx = await token.approve(USER_PROFILE_CREDIT, depositAmount);
        console.log('✅ 授权交易已发送:', approveTx.hash);
        await approveTx.wait();
        console.log('✅ 授权成功!\n');
    }
    
    // 查询当前押金
    const currentCredit = await userProfile.getUserCredit(wallet.address);
    console.log('💎 当前押金:', ethers.utils.formatEther(currentCredit), 'NIUMA');
    
    // 充值押金
    console.log('\n📤 发送充值交易...');
    const tx = await userProfile.depositCollateral(depositAmount);
    
    console.log('✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 充值成功!');
        const newCredit = await userProfile.getUserCredit(wallet.address);
        console.log('💎 新的押金:', ethers.utils.formatEther(newCredit), 'NIUMA');
        console.log('\n🎉 现在可以尝试接单了!');
    } else {
        console.log('❌ 充值失败');
    }
}

// 获取命令行参数
const amount = process.argv[2];

if (!amount || isNaN(amount)) {
    console.log('使用方法: node deposit-collateral.js <金额>');
    console.log('例如: node deposit-collateral.js 1000');
    process.exit(1);
}

depositCollateral(parseFloat(amount)).catch(console.error);
