const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

// 从 build-tx 获取的 unsignedTx (任务 1)
const unsignedTx = {
  "to": "0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370",
  "data": "0x6094b4d70000000000000000000000000000000000000000000000000000000000000001",
  "value": "0",
  "chainId": 1952,
  "gasPrice": "20000001"
};

async function sendTx() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('🎯 接单任务 1（其他人的任务）');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 更新 nonce
    const nonce = await wallet.getNonce();
    unsignedTx.nonce = nonce;
    console.log('📋 Nonce:', nonce);
    console.log('📋 任务ID: 1');
    console.log('📋 任务创建者: 0x9F2c32fB4d690D5760860A76aE1Ed711DA6e5146\n');
    
    // 发送交易
    console.log('📤 发送接单交易...');
    const tx = await wallet.sendTransaction(unsignedTx);
    
    console.log('✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 接单成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('  Gas 使用:', receipt.gasUsed.toString());
        console.log('\n🎉 你已接单任务 1！');
        console.log('任务: 测试任务');
        console.log('赏金: 100 NIUMA');
        console.log('要求: 完成截图即可');
    } else {
        console.log('❌ 接单失败');
    }
}

sendTx().catch(console.error);
