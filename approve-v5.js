const ethers = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const NIUMA_TOKEN = '0x49ABB6BFFEce92EAd9E71BCA930Ac877ef71939D';
const CORE_CONTRACT = '0x3E7765a23AEE412bfc36760Ec8Abb495fb5c6370';

async function main() {
    // 创建 provider 和 wallet
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 获取 nonce 和 gas price
    const nonce = await wallet.getTransactionCount();
    const gasPrice = await provider.getGasPrice();
    
    console.log('📊 网络信息:');
    console.log('  Nonce:', nonce);
    console.log('  Gas Price:', gasPrice.toString());
    
    // 构建交易
    const approveAmount = ethers.utils.parseEther('10000');
    const iface = new ethers.utils.Interface([
        'function approve(address spender, uint256 amount)'
    ]);
    const data = iface.encodeFunctionData('approve', [CORE_CONTRACT, approveAmount]);
    
    const txData = {
        to: NIUMA_TOKEN,
        data: data,
        gasLimit: 100000,
        gasPrice: gasPrice,
        nonce: nonce,
        chainId: 1952
    };
    
    console.log('\n📋 交易详情:');
    console.log('  To:', txData.to);
    console.log('  Data:', txData.data.slice(0, 50) + '...');
    console.log('  Gas Limit:', txData.gasLimit);
    console.log('  Gas Price:', txData.gasPrice.toString());
    console.log('  Nonce:', txData.nonce);
    console.log('  Chain ID:', txData.chainId);
    
    // 发送交易
    console.log('\n📤 发送交易...');
    const tx = await wallet.sendTransaction(txData);
    
    console.log('✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    // 等待确认
    console.log('\n⏳ 等待确认 (约 10-20 秒)...');
    const receipt = await tx.wait();
    
    if (receipt && receipt.status === 1) {
        console.log('✅ 授权成功!');
        console.log('  区块:', receipt.blockNumber);
        console.log('  Gas 使用:', receipt.gasUsed.toString());
        console.log('\n🎉 现在可以接单了!');
    } else {
        console.log('❌ 交易失败或被回滚');
    }
}

main().catch(error => {
    console.error('❌ 错误:', error.message);
    console.error(error);
});
