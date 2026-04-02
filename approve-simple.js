const { ethers } = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';

const NIUMA_TOKEN = '0x49abb6bffce92ead9e71bca930ac877ef71939d';
const CORE_CONTRACT = '0x3e7765a23aee412bfc36760ec8abb495fb5c6370';

// ERC20 approve 函数签名
const APPROVE_DATA = '0x095ea7b3' + 
    '000000000000000000000000' + CORE_CONTRACT.slice(2) +
    '00000000000000000000000000000000000000000000021e19e0c9bab2400000'; // 10000 * 10^18

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const signer = wallet.connect(provider);
    
    const address = await signer.getAddress();
    console.log('👛 钱包地址:', address);
    
    const balance = await provider.getBalance(address);
    console.log('💰 OKB 余额:', ethers.formatEther(balance));
    
    console.log('\n📋 授权交易:');
    console.log('  Token:', NIUMA_TOKEN);
    console.log('  Spender:', CORE_CONTRACT);
    console.log('  Data:', APPROVE_DATA);
    
    console.log('\n⚠️  确认授权 10000 NIUMA? 等待 3 秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const tx = await signer.sendTransaction({
        to: NIUMA_TOKEN,
        data: APPROVE_DATA,
        gasLimit: 100000
    });
    
    console.log('✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 授权成功!');
    } else {
        console.log('❌ 授权失败');
    }
}

main().catch(console.error);
