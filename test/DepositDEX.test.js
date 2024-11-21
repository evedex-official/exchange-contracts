
const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const order = require('solhint/lib/rules/order');
const { deployProxyWithLibraries, deployWithLibraries } = require('./helpers/deploy-utils');

describe('DepositDex contract', function () {

    let depositDex, vault, eveDex, sessions, token, tokenAddress;

    let owner, alice, bob, liquidator, fundingRateAccount, matcher;

    beforeEach(async function () {
        [owner, alice, bob, liquidator, fundingRateAccount, matcher] = await ethers.getSigners();

        let orderLib = await deployWithLibraries('OrderValidationLib', []);
        sessions = await deployWithLibraries('SessionManager', [owner.address])

        const libraries = { libraries: { OrderValidationLib: await orderLib.getAddress() } };

        vault = await deployWithLibraries('EveVault', [owner.address]);
        depositDex = await deployProxyWithLibraries(
            'DepositDEX', 
            [], 
            libraries, 
            false, 
            owner.address
        );

        eveDex = await deployProxyWithLibraries(
            'EveDEX',
            [
                owner.address,
                await depositDex.getAddress(),
                await sessions.getAddress(),
                fundingRateAccount.address,
                128,
                80,
                500,
                0,
            ],
            libraries,
            true,
            owner.address,
        );

        await depositDex.initialize(await eveDex.getAddress(), await vault.getAddress());

        await eveDex.grantRole(ethers.ZeroHash, owner.address);
        const matcherRole = await eveDex.MATCHER_ROLE();
        await eveDex.grantRole(matcherRole, matcher.address);

        const validatorRole = await sessions.VALIDATOR_ROLE();
        await sessions.grantRole(validatorRole, await eveDex.getAddress());

        MockToken = await ethers.getContractFactory('ERC20Mock');
        token = await MockToken.deploy();
        tokenAddress = await token.getAddress();
        
        await depositDex.setCollateralConfigs([tokenAddress], [true])
    });


    it('contracts are correctly initialized', async function () {
        const depositDexAddress = await depositDex.baseDex();
        expect(depositDexAddress).to.equal(await eveDex.getAddress(), "wrong evedex address");

        const vaultAddress = await depositDex.vault();
        expect(vaultAddress).to.equal(await vault.getAddress(), "wrong vault address")
    })

    it('should deposit collateral', async function() {
        const amount = await ethers.parseEther("100")
        await token.mint(alice.address, amount);

        await token.connect(alice).approve(await depositDex.getAddress(), amount);

        await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

        const totalBalance = await depositDex.getTotalBalance(alice.address, [{index: 0, price: 100000000}])
        expect(totalBalance).to.equal(amount, "wrong total balance")
    })

});