const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';

async function joinTask(taskId) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log(`🎯 尝试接任务 ${taskId}`);
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    const nonce = await wallet.getTransactionCount();
    const gasPrice = await provider.getGasPrice();
    
    // participateTask(uint256 taskId) = 0x6094b4d7
    const iface = new ethers.utils.Interface([
        'function participateTask(uint256 taskId)'
    ]);
    const data = iface.encodeFunctionData('participateTask', [taskId]);
    
    const txData = {
        to: CORE_CONTRACT,
        data: data,
        gasLimit: 300000,
        gasPrice: gasPrice,
        nonce: nonce,
        chainId: 1952
    };
    
    console.log('📋 交易详情:');
    console.log('  To:', txData.to);
    console.log('  Task ID:', taskId);
    console.log('  Gas Limit:', txData.gasLimit);
    console.log('  Gas Price:', txData.gasPrice.toString());
    console.log('  Nonce:', txData.nonce);
    
    console.log('\n📤 发送交易...');
    
    try {
        const tx = await wallet.sendTransaction(txData);
        
        console.log('✅ 交易已发送!');
        console.log('  Hash:', tx.hash);
        console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
        
        console.log('\n⏳ 等待确认...');
        const receipt = await tx.wait();
        
        if (receipt && receipt.status === 1) {
            console.log('✅ 接单成功!');
            console.log('  区块:', receipt.blockNumber);
            console.log('  Gas 使用:', receipt.gasUsed.toString());
            console.log('\n🎉 现在去完成任务并提交工作证明!');
            return true;
        } else {
            console.log('❌ 交易失败或被回滚');
            console.log('  Receipt:', receipt);
            return false;
        }
    } catch (error) {
        console.log('❌ 交易失败:', error.message);
        if (error.message.includes('revert')) {
            console.log('\n⚠️  可能原因：');
            console.log('  - 任务创建者设置了白名单');
            console.log('  - 需要特定条件（如最低贡献值）');
            console.log('  - 任务已满员');
            console.log('  - 需要额外的押金/质押');
        }
        return false;
    }
}

// 获取命令行参数
const taskId = process.argv[2];

if (!taskId) {
    console.log('使用方法: node join-task-specific.js <任务ID>');
    console.log('例如: node join-task-specific.js 9');
    process.exit(1);
}

joinTask(parseInt(taskId)).then(success => {
    process.exit(success ? 0 : 1);
});
