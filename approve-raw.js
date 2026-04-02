const { ethers } = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const NIUMA_TOKEN = '0x49abb6bffce92ead9e71bca930ac877ef71939d';
const CORE_CONTRACT = '0x3e7765a23aee412bfc36760ec8abb495fb5c6370';

async function main() {
    // 创建 provider 和 wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 获取 nonce 和 gas price
    const nonce = await provider.getTransactionCount(wallet.address);
    const feeData = await provider.getFeeData();
    
    console.log('📊 网络信息:');
    console.log('  Nonce:', nonce);
    console.log('  Gas Price:', feeData.gasPrice?.toString());
    
    // 构建交易
    const approveAmount = '10000000000000000000000'; // 10000 * 10^18
    const data = '0x095ea7b3' + 
        '000000000000000000000000' + CORE_CONTRACT.slice(2) +
        approveAmount.padStart(64, '0');
    
    const txData = {
        to: NIUMA_TOKEN,
        data: data,
        gasLimit: 100000,
        gasPrice: feeData.gasPrice || 20000000000,
        nonce: nonce,
        chainId: 1952,
        type: 0
    };
    
    console.log('\n📋 交易详情:');
    console.log('  To:', txData.to);
    console.log('  Data:', txData.data.slice(0, 50) + '...');
    console.log('  Gas Limit:', txData.gasLimit);
    console.log('  Gas Price:', txData.gasPrice.toString());
    console.log('  Nonce:', txData.nonce);
    
    // 签名交易
    console.log('\n✍️  签名交易...');
    const signedTx = await wallet.signTransaction(txData);
    console.log('  Signed:', signedTx.slice(0, 50) + '...');
    
    // 发送交易
    console.log('\n📤 发送交易...');
    const tx = await provider.broadcastTransaction(signedTx);
    
    console.log('✅ 交易已广播!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    // 等待确认
    console.log('\n⏳ 等待确认 (约 10-20 秒)...');
    const receipt = await provider.waitForTransaction(tx.hash);
    
    if (receipt && receipt.status === 1) {
        console.log('✅ 授权成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('  Gas 使用:', receipt.gasUsed.toString());
    } else {
        console.log('❌ 交易失败或被回滚');
    }
}

main().catch(error => {
    console.error('❌ 错误:', error.message);
    console.error(error);
});
