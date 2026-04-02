const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const USER_PROFILE_CREDIT = '0x6CcDefaa116E17f19AC3A28d24f4b0C4a83C7B45';
const NIUMA_TOKEN = '0x49ABB6BFFEce92EAd9E71BCA930Ac877ef71939D';

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

async function deposit(amount) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('💎 充值押金（直接发送交易）');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    console.log('💰 充值金额:', amount, 'NIUMA\n');
    
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 检查余额
    const balance = await token.balanceOf(wallet.address);
    const depositAmount = ethers.utils.parseEther(amount.toString());
    
    if (balance.lt(depositAmount)) {
        console.log('❌ 余额不足！');
        return;
    }
    
    // 检查并授权
    const allowance = await token.allowance(wallet.address, USER_PROFILE_CREDIT);
    console.log('🔓 当前授权额度:', ethers.utils.formatEther(allowance), 'NIUMA');
    
    if (allowance.lt(depositAmount)) {
        console.log('\n⚠️  授权额度不足，正在授权...');
        const approveTx = await token.approve(USER_PROFILE_CREDIT, depositAmount);
        console.log('✅ 授权交易:', approveTx.hash);
        await approveTx.wait();
        console.log('✅ 授权成功!\n');
    }
    
    // 构建 depositCollateral 交易
    // depositCollateral(uint256 amount) = 0xed88... 
    const iface = new ethers.utils.Interface([
        "function depositCollateral(uint256 amount) external"
    ]);
    const data = iface.encodeFunctionData("depositCollateral", [depositAmount]);
    
    console.log('📤 发送充值交易...');
    console.log('  To:', USER_PROFILE_CREDIT);
    console.log('  Data:', data);
    
    const tx = await wallet.sendTransaction({
        to: USER_PROFILE_CREDIT,
        data: data,
        gasLimit: 200000
    });
    
    console.log('\n✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 充值成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('\n🎉 押金已充值，现在可以尝试接单了!');
    } else {
        console.log('❌ 充值失败，交易被回滚');
        console.log('  可能原因：合约没有 depositCollateral 函数');
        console.log('  或者需要其他条件');
    }
}

const amount = process.argv[2];
if (!amount) {
    console.log('使用方法: node deposit-simple.js <金额>');
    console.log('例如: node deposit-simple.js 500');
    process.exit(1);
}

deposit(parseFloat(amount)).catch(console.error);
