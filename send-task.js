const { ethers } = require('ethers');

// 配置
const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';
const CHAIN_ID = 1952;

// 合约地址
const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';

// 任务ID
const TASK_ID = 5;

async function main() {
    console.log('🚀 连接到 XLayer 测试网...');
    
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 检查余额
    const balance = await provider.getBalance(wallet.address);
    console.log('💰 OKB 余额:', ethers.formatEther(balance));
    
    // 构建交易数据 - participateTask(uint256 taskId)
    const data = '0x6094b4d7' + TASK_ID.toString(16).padStart(64, '0');
    
    console.log('\n📋 交易详情:');
    console.log('  To:', CORE_CONTRACT);
    console.log('  Data:', data);
    console.log('  Task ID:', TASK_ID);
    
    // 获取 nonce
    const nonce = await provider.getTransactionCount(wallet.address);
    console.log('  Nonce:', nonce);
    
    // 估算 gas（可能失败，使用固定值）
    let gasLimit;
    try {
        const gasEstimate = await provider.estimateGas({
            to: CORE_CONTRACT,
            data: data,
            from: wallet.address
        });
        gasLimit = gasEstimate * 120n / 100n;
        console.log('  Gas 估算:', gasEstimate.toString());
    } catch (e) {
        gasLimit = 200000n; // 使用固定 gas limit
        console.log('  Gas 估算失败，使用默认值: 200000');
    }
    
    // 确认
    console.log('\n⚠️  确认发送交易? (查看上面的信息)');
    console.log('按 Ctrl+C 取消，或等待 5 秒自动发送...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 发送交易
    console.log('📤 发送交易中...');
    
    const tx = await wallet.sendTransaction({
        to: CORE_CONTRACT,
        data: data,
        gasLimit: gasLimit,
        chainId: CHAIN_ID
    });
    
    console.log('✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    // 等待确认
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    console.log('✅ 交易已确认!');
    console.log('  区块:', receipt.blockNumber);
    console.log('  Gas 使用:', receipt.gasUsed.toString());
    
    if (receipt.status === 1) {
        console.log('\n🎉 接单成功!');
        console.log('现在去牛马社区艾特女生说"想你了"，然后截图提交工作证明');
    } else {
        console.log('\n❌ 交易失败');
    }
}

main().catch(error => {
    console.error('❌ 错误:', error.message);
    process.exit(1);
});
