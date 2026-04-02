const ethers = require('ethers');
const fs = require('fs');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

// 读取合约地址
const contracts = JSON.parse(fs.readFileSync('./references/contracts.json', 'utf8')).contracts;
const CORE_CONTRACT = contracts.core;
const NIUMA_TOKEN = contracts.niumaToken;

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

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
    console.log('📝 创建任务（v1.0.10 版本）');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 获取当前区块时间
    const block = await provider.getBlock('latest');
    const blockTimestamp = block.timestamp;
    console.log('⛓️  当前区块时间:', new Date(blockTimestamp * 1000).toLocaleString());
    console.log('  区块号:', block.number);
    
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 检查余额
    const balance = await token.balanceOf(wallet.address);
    console.log('\n💰 NIUMA 余额:', ethers.utils.formatEther(balance));
    
    // 任务参数（符合 v1.0.10 要求）
    const bountyPerUser = ethers.utils.parseEther('100'); // 最低 100 NIUMA
    const maxParticipants = 2;
    const totalBounty = bountyPerUser.mul(maxParticipants);
    const platformFee = totalBounty.mul(13).div(100); // 13% 手续费
    const totalNeeded = totalBounty.add(platformFee);
    
    // 时间设置（关键！）
    const startTime = blockTimestamp + 120; // 区块时间 + 2分钟
    const endTime = startTime + 86400; // 1天后结束（不超过30天）
    
    console.log('\n📋 任务参数:');
    console.log('  标题: 测试任务v2');
    console.log('  描述: 这是一个测试任务');
    console.log('  要求: 完成简单测试');
    console.log('  赏金/人:', ethers.utils.formatEther(bountyPerUser), 'NIUMA');
    console.log('  最大人数:', maxParticipants);
    console.log('  总赏金:', ethers.utils.formatEther(totalBounty), 'NIUMA');
    console.log('  平台手续费(13%):', ethers.utils.formatEther(platformFee), 'NIUMA');
    console.log('  总计需要:', ethers.utils.formatEther(totalNeeded), 'NIUMA');
    console.log('  开始时间:', new Date(startTime * 1000).toLocaleString(), `(区块时间+${startTime - blockTimestamp}秒)`);
    console.log('  结束时间:', new Date(endTime * 1000).toLocaleString());
    console.log('  分类ID: 1');
    
    if (balance.lt(totalNeeded)) {
        console.log('\n❌ 余额不足！需要', ethers.utils.formatEther(totalNeeded), 'NIUMA');
        return;
    }
    
    // 检查授权
    const allowance = await token.allowance(wallet.address, CORE_CONTRACT);
    console.log('\n🔓 当前授权额度:', ethers.utils.formatEther(allowance), 'NIUMA');
    
    if (allowance.lt(totalNeeded)) {
        console.log('⚠️  授权额度不足，正在授权...');
        const approveTx = await token.approve(CORE_CONTRACT, totalNeeded.mul(2)); // 授权2倍避免频繁授权
        console.log('✅ 授权交易:', approveTx.hash);
        await approveTx.wait();
        console.log('✅ 授权成功!\n');
    }
    
    // 构建 createTask 交易
    const iface = new ethers.utils.Interface(CREATE_TASK_ABI);
    const data = iface.encodeFunctionData("createTask", [
        "测试任务v2",
        "这是一个测试任务",
        "完成简单测试",
        0, // 普通任务
        bountyPerUser,
        maxParticipants,
        startTime,
        endTime,
        NIUMA_TOKEN,
        1
    ]);
    
    console.log('📤 发送创建任务交易...');
    console.log('  To:', CORE_CONTRACT);
    console.log('  Gas Limit: 950000');
    
    const tx = await wallet.sendTransaction({
        to: CORE_CONTRACT,
        data: data,
        gasLimit: 950000 // v1.0.10 建议
    });
    
    console.log('\n✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 任务创建成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('  Gas 使用:', receipt.gasUsed.toString());
        console.log('\n🎉 测试任务已创建!');
    } else {
        console.log('❌ 任务创建失败');
    }
}

createTask().catch(console.error);
