const ethers = require('ethers');

const RPC_URL = 'https://xlayertestrpc.okx.com';
const CATEGORY_MANAGER = '0xA63C1aBAe66a1687b80Da9573203DDcB9B19D47C';

// CategoryManager ABI
const CATEGORY_ABI = [
    "function categoryCount() external view returns (uint256)",
    "function categories(uint256 categoryId) external view returns (uint256 id, string memory name, string memory description, bool isActive)"
];

async function checkCategories() {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: 'xlayer-testnet',
        chainId: 1952
    });
    
    const categoryManager = new ethers.Contract(CATEGORY_MANAGER, CATEGORY_ABI, provider);
    
    console.log('========================================');
    console.log('📋 查询任务分类');
    console.log('========================================\n');
    
    try {
        const count = await categoryManager.categoryCount();
        console.log('分类总数:', count.toString());
        
        for (let i = 1; i <= count; i++) {
            try {
                const cat = await categoryManager.categories(i);
                console.log(`\n分类 ${i}:`);
                console.log('  ID:', cat.id.toString());
                console.log('  名称:', cat.name);
                console.log('  描述:', cat.description);
                console.log('  是否激活:', cat.isActive);
            } catch (e) {
                console.log(`\n分类 ${i}: 无法查询`);
            }
        }
    } catch (error) {
        console.log('❌ 查询失败:', error.message);
    }
}

checkCategories().catch(console.error);
