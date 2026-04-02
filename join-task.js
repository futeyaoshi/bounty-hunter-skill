const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';
const TASK_ID = 5;

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('👛 钱包地址:', wallet.address);
    
    const nonce = await wallet.getTransactionCount();
    const gasPrice = await provider.getGasPrice();
    
    console.log('📊 网络信息:');
    console.log('  Nonce:', nonce);
    console.log('  Gas Price:', gasPrice.toString());
    
    // participateTask(uint256 taskId) = 0x6094b4d7
    const iface = new ethers.utils.Interface([
        'function participateTask(uint256 taskId)'
    ]);
    const data = iface.encodeFunctionData('participateTask', [TASK_ID]);
    
    const txData = {
        to: CORE_CONTRACT,
        data: data,
        gasLimit: 200000,
        gasPrice: gasPrice,
        nonce: nonce,
        chainId: 1952
    };
    
    console.log('\n📋 接单交易:');
    console.log('  To:', txData.to);
    console.log('  Task ID:', TASK_ID);
    console.log('  Data:', data);
    
    console.log('\n📤 发送交易...');
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
        console.log('\n🎉 任务已接，现在去牛马社区艾特女生说"想你了"，然后截图提交!');
    } else {
        console.log('❌ 交易失败');
        console.log('  Receipt:', receipt);
    }
}

main().catch(console.error);
