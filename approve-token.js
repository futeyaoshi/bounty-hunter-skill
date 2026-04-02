const { ethers } = require('ethers');

const PRIVATE_KEY = '0x804aceb5979c3e6fb98bc4240275b9ee83311ed8fa0c03f9be36218859ef6a67';
const RPC_URL = 'https://xlayertestrpc.okx.com';
const CHAIN_ID = 1952;

const NIUMA_TOKEN = '0x49abb6bffce92ead9e71bca930ac877ef71939d';
const CORE_CONTRACT = '0x3e7765a23aee412bfc36760ec8abb495fb5c6370';

// ERC20 ABI (仅包含 approve)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('👛 钱包地址:', wallet.address);
    
    // 创建 Token 合约实例
    const token = new ethers.Contract(NIUMA_TOKEN, ERC20_ABI, wallet);
    
    // 查询余额
    const balance = await token.balanceOf(wallet.address);
    console.log('💰 NIUMA 余额:', ethers.formatEther(balance));
    
    // 查询当前授权额度
    const currentAllowance = await token.allowance(wallet.address, CORE_CONTRACT);
    console.log('🔓 当前授权额度:', ethers.formatEther(currentAllowance));
    
    // 授权额度 (10000 NIUMA)
    const approveAmount = ethers.parseEther('10000');
    
    if (currentAllowance >= approveAmount) {
        console.log('✅ 授权额度已足够，无需重复授权');
        return;
    }
    
    console.log('\n📋 授权详情:');
    console.log('  Token:', NIUMA_TOKEN);
    console.log('  Spender (Core):', CORE_CONTRACT);
    console.log('  Amount:', ethers.formatEther(approveAmount), 'NIUMA');
    
    console.log('\n⚠️  确认授权? 等待 3 秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('📤 发送授权交易...');
    const tx = await token.approve(CORE_CONTRACT, approveAmount);
    
    console.log('✅ 交易已发送!');
    console.log('  Hash:', tx.hash);
    console.log('  浏览器: https://www.oklink.com/xlayer-test/tx/' + tx.hash);
    
    console.log('\n⏳ 等待确认...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log('✅ 授权成功!');
        
        // 验证授权
        const newAllowance = await token.allowance(wallet.address, CORE_CONTRACT);
        console.log('🔓 新的授权额度:', ethers.formatEther(newAllowance), 'NIUMA');
        
        console.log('\n🎉 现在可以接单了!');
    } else {
        console.log('❌ 授权失败');
    }
}

main().catch(error => {
    console.error('❌ 错误:', error.message);
    process.exit(1);
});
