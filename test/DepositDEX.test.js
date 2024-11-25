
const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const order = require('solhint/lib/rules/order');
const { deployProxyWithLibraries, deployWithLibraries } = require('./helpers/deploy-utils');

describe('DepositDex contract', function () {

    let depositDex, vault, eveDex, sessions, token, tokenAddress, orderLib;

    let owner, alice, bob, liquidator, fundingRateAccount, matcher;

    beforeEach(async function () {
        [owner, alice, bob, liquidator, fundingRateAccount, matcher] = await ethers.getSigners();

        orderLib = await deployWithLibraries('OrderValidationLib', []);
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
            'EVEDEX',
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

        const collateralPriceData = [
            { collateral: tokenAddress, price: 100000000}
        ]
        const totalBalance = await depositDex.getTotalBalance(alice.address, collateralPriceData)
        expect(totalBalance).to.equal(amount, "wrong total balance")
    })

    it('should withdraw balance by matcher', async function() {
        const amount = ethers.parseEther('100');
        await token.mint(alice.address, amount);

        await token.connect(alice).approve(await depositDex.getAddress(), amount);
        await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

        const withdrawalAmount = ethers.parseEther('10');
        const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        const withdrawalOrder = {
            collateral: tokenAddress,
            account: alice.address,
            amount: withdrawalAmount,
            session: ethers.ZeroAddress,
            expiration: expiration,
        };

        const domain = {
            name: "EVEDEX",
            version: "1",
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: await depositDex.getAddress()
        }

        const types = {
            OrderWithdrawal: [
                { name: "collateral", type: "address" },
                { name: "account", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "session", type: "address" },
                { name: "expiration", type: "uint256" },
            ],
        };

        const instrumentPrices = [
            {
                index: 0,
                price: 100000000
            }
        ]

        const collateralPrices = [
            {
                collateral: tokenAddress,
                price: 100000000
            }
        ]
        
        const signature= await alice.signTypedData(domain, types, withdrawalOrder);
        await depositDex.connect(matcher).withdrawComplete(
            {...withdrawalOrder, signature: signature},
            { collateralPrices, instrumentPrices }, // fullPrices
            0, // historyTimestamp
            0 // historySearchHint
        )

    });
        

});