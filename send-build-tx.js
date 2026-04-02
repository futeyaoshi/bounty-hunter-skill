const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

// 从 build-tx 获取的 unsignedTx
const unsignedTx = {
  "to": "0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370",
  "data": "0x8b60d4ff0000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056bc75e2d6310000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000069c32a300000000000000000000000000000000000000000000000000000000069c47bb000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000049abb6bffece92ead9e71bca930ac877ef71939d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000ee6b58be8af95e4bbbbe58aa17633000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ce6b58be8af95e68f8fe8bfb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ce6b58be8af95e8a681e6b1820000000000000000000000000000000000000000",
  "value": "0",
  "chainId": 1952,
  "gasPrice": "20000001",
  "nonce": 28
};

async function sendTx() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('========================================');
    console.log('📝 发送创建任务交易（使用 build-tx 数据）');
    console.log('========================================\n');
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 更新 nonce
    const nonce = await wallet.getNonce();
    unsignedTx.nonce = nonce;
    console.log('📋 Nonce:', nonce);
    
    // 发送交易
    console.log('\n📤 发送交易...');
    const tx = await wallet.sendTransaction(unsignedTx);
    
    console.log('✅ 交易已发送!');
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

sendTx().catch(console.error);
