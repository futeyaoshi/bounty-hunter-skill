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

// 参考任务 1 的参数
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
    console.log('📝 使用参考参数创建任务');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 检查余额
    const balance = await token.balanceOf(wallet.address);
    console.log('💰 NIUMA 余额:', ethers.utils.formatEther(balance));
    
    // 参考任务 1 的参数
    const bountyPerUser = ethers.utils.parseEther('100'); // 100 NIUMA (和任务1相同)
    const maxParticipants = 2; // 和任务1相同
    const totalBounty = bountyPerUser.mul(maxParticipants);
    
    // 时间戳 - 必须使用未来的时间（大于当前区块时间）
    const now = Math.floor(Date.now() / 1000);
    const startTime = now + 1800; // 30分钟后开始（确保大于区块时间）
    const endTime = now + 90000; // 25小时后结束
    
    console.log('\n📋 任务参数（参考任务1）:');
    console.log('  标题: 测试任务2');
    console.log('  描述: 测试描述');
    console.log('  要求: 测试要求');
    console.log('  赏金/人:', ethers.utils.formatEther(bountyPerUser), 'NIUMA');
    console.log('  最大人数:', maxParticipants);
    console.log('  总赏金:', ethers.utils.formatEther(totalBounty), 'NIUMA');
    console.log('  开始时间:', new Date(startTime * 1000).toLocaleString());
    console.log('  结束时间:', new Date(endTime * 1000).toLocaleString());
    console.log('  分类ID: 1');
    
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
    const iface = new ethers.utils.Interface(CREATE_TASK_ABI);
    const data = iface.encodeFunctionData("createTask", [
        "测试任务2",           // title
        "测试描述",            // description
        "测试要求",            // requirements
        0,                     // taskType: 普通任务
        bountyPerUser,         // bountyPerUser
        maxParticipants,       // maxParticipants
        startTime,             // startTime
        endTime,               // endTime
        NIUMA_TOKEN,           // tokenAddress
        1                      // categoryId
    ]);
    
    console.log('📤 发送创建任务交易...');
    console.log('  To:', CORE_CONTRACT);
    
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
        console.log('\n🎉 测试任务已创建!');
    } else {
        console.log('❌ 任务创建失败');
        console.log('  可能原因：');
        console.log('  - categoryId 不存在');
        console.log('  - 需要其他权限');
        console.log('  - 合约暂停');
    }
}

createTask().catch(console.error);
