const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';
const NIUMA_TOKEN = '0x49ABB6BFFEce92EAd9E71BCA930Ac877ef71939D';

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

// createTask 函数 ABI
const CREATE_TASK_ABI = [
    "function createTask(string memory title, string memory description, string memory requirements, uint8 taskType, uint256 bountyPerUser, uint256 maxParticipants, uint256 startTime, uint256 endTime, address tokenAddress, uint256 categoryId) external returns (uint256)"
];

async function createTask() {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('📝 创建测试任务');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 检查余额
    const balance = await token.balanceOf(wallet.address);
    console.log('💰 NIUMA 余额:', ethers.utils.formatEther(balance));
    
    // 任务参数
    const bountyPerUser = ethers.utils.parseEther('50'); // 50 NIUMA
    const maxParticipants = 5;
    const totalBounty = bountyPerUser.mul(maxParticipants);
    
    console.log('\n📋 任务参数:');
    console.log('  标题: 测试任务 - 简单点赞');
    console.log('  赏金/人:', ethers.utils.formatEther(bountyPerUser), 'NIUMA');
    console.log('  最大人数:', maxParticipants);
    console.log('  总赏金:', ethers.utils.formatEther(totalBounty), 'NIUMA');
    
    if (balance.lt(totalBounty)) {
        console.log('\n❌ 余额不足！');
        return;
    }
    
    // 检查授权
    const allowance = await token.allowance(wallet.address, CORE_CONTRACT);
    console.log('\n🔓 当前授权额度:', ethers.utils.formatEther(allowance), 'NIUMA');
    
    if (allowance.lt(totalBounty)) {
        console.log('⚠️  授权额度不足，正在授权...');
        const approveTx = await token.approve(CORE_CONTRACT, totalBounty);
        console.log('✅ 授权交易:', approveTx.hash);
        await approveTx.wait();
        console.log('✅ 授权成功!\n');
    }
    
    // 构建 createTask 交易
    const now = Math.floor(Date.now() / 1000);
    const startTime = now + 60; // 1分钟后开始
    const endTime = now + 7 * 24 * 60 * 60; // 7天后结束
    
    const iface = new ethers.utils.Interface(CREATE_TASK_ABI);
    const data = iface.encodeFunctionData("createTask", [
        "测试任务 - 简单点赞",
        "这是一个测试任务，只需要给推文点赞即可",
        "1. 关注 @niuma 2. 点赞指定推文",
        0, // taskType: 普通任务
        bountyPerUser,
        maxParticipants,
        startTime,
        endTime,
        NIUMA_TOKEN,
        1 // categoryId
    ]);
    
    console.log('📤 发送创建任务交易...');
    console.log('  To:', CORE_CONTRACT);
    console.log('  Data:', data.slice(0, 100) + '...');
    
    const tx = await wallet.sendTransaction({
        to: CORE_CONTRACT,
        data: data,
        gasLimit: 500000
    });
    
    console.log('\n✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 任务创建成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('\n🎉 测试任务已创建，现在可以尝试接单了!');
    } else {
        console.log('❌ 任务创建失败');
    }
}

createTask().catch(console.error);
