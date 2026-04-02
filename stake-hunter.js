const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

// 新的 UserProfileCredit 合约地址
const USER_PROFILE_CREDIT = '0xB04c2ac4cA69c4B8b06E69d17523a72537D6Faef';
const NIUMA_TOKEN = '0x49ABB6BFFEce92EAd9E71BCA930Ac877ef71939D';

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

async function stakeHunter(amount) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('💎 存入接单押金 (stakeHunter)');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    console.log('💰 押金金额:', amount, 'NIUMA\n');
    
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 检查余额
    const balance = await token.balanceOf(wallet.address);
    const stakeAmount = ethers.utils.parseEther(amount.toString());
    
    if (balance.lt(stakeAmount)) {
        console.log('❌ 余额不足！');
        console.log('  当前余额:', ethers.utils.formatEther(balance), 'NIUMA');
        console.log('  需要:', amount, 'NIUMA');
        return;
    }
    
    // 检查并授权
    const allowance = await token.allowance(wallet.address, USER_PROFILE_CREDIT);
    console.log('🔓 当前授权额度:', ethers.utils.formatEther(allowance), 'NIUMA');
    
    if (allowance.lt(stakeAmount)) {
        console.log('\n⚠️  授权额度不足，正在授权...');
        const approveTx = await token.approve(USER_PROFILE_CREDIT, stakeAmount);
        console.log('✅ 授权交易:', approveTx.hash);
        await approveTx.wait();
        console.log('✅ 授权成功!\n');
    }
    
    // 构建 stakeHunter 交易
    const iface = new ethers.utils.Interface([
        "function stakeHunter(uint256 amount) external"
    ]);
    const data = iface.encodeFunctionData("stakeHunter", [stakeAmount]);
    
    console.log('📤 发送押金交易...');
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
        console.log('✅ 押金存入成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('\n🎉 现在可以接单了!');
        console.log('任务 5 需要 100 NIUMA 押金，任务 11 需要 300 NIUMA 押金');
    } else {
        console.log('❌ 押金存入失败');
    }
}

const amount = process.argv[2];
if (!amount) {
    console.log('使用方法: node stake-hunter.js <金额>');
    console.log('例如:');
    console.log('  node stake-hunter.js 100    # 存 100 NIUMA，可接任务 5');
    console.log('  node stake-hunter.js 300    # 存 300 NIUMA，可接任务 11');
    console.log('  node stake-hunter.js 1000   # 存 1000 NIUMA，可接多个任务');
    process.exit(1);
}

stakeHunter(parseFloat(amount)).catch(console.error);
