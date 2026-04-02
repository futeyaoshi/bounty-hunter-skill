const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

async function joinTask() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('🎯 接单任务 1（跳过 gas 估算）');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    const nonce = await wallet.getNonce();
    console.log('📋 Nonce:', nonce);
    
    // 直接构建交易，跳过 estimateGas
    const tx = {
        to: '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370',
        data: '0x6094b4d70000000000000000000000000000000000000000000000000000000000000001',
        gasLimit: 300000, // 固定 gas limit
        chainId: 1952,
        nonce: nonce
    };
    
    console.log('📤 发送接单交易...');
    console.log('  Gas Limit: 300000');
    
    const sentTx = await wallet.sendTransaction(tx);
    
    console.log('✅ 交易已发送!');
    console.log('  Hash:', sentTx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + sentTx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await sentTx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 接单成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('  Gas 使用:', receipt.gasUsed.toString());
        console.log('\n🎉 你已接单任务 1！');
    } else {
        console.log('❌ 接单失败，交易被回滚');
        console.log('  可能原因：');
        console.log('  - 任务创建者设置了白名单');
        console.log('  - 需要其他条件');
    }
}

joinTask().catch(console.error);
