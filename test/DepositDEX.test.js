
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


        await eveDex.grantRole(matcherRole, owner.address); //todo hack, should be fixed in contract
        await eveDex.connect(owner).addInstrument(
            ["BTC/USD",
            "", "", "", "", "", "", "", "", "", "", ""],
            10,
            0,
            0,
            0
        )
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

        const price = 100000000;

        const totalBalance = await depositDex.getTotalBalance(alice.address, [{index: 0, price}])
        expect(totalBalance).to.equal(amount, "wrong total balance")
    })

    it('get balance should return correct result', async function () {
        const amount = ethers.parseEther("100")
        await token.mint(alice.address, amount);

        await token.connect(alice).approve(await depositDex.getAddress(), amount);

        await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

        const price = 100000000;
        const balance = await depositDex.getBalance(alice.address, tokenAddress, price);

        expect(balance).to.equal(amount, "wrong balance")
    })

    it('should withdraw balance by matcher', async function() {
        const libraries = { libraries: { OrderValidationLib: await orderLib.getAddress() } };
        const OrderValidationWrapper = await ethers.getContractFactory("OrderValidationWrapper", libraries);

        orderValidationWrapper = await OrderValidationWrapper.deploy();
        await orderValidationWrapper.waitForDeployment();

        const withdrawalOrderTypeHash = await orderValidationWrapper.WITHDRAWAL_ORDER_TYPEHASH();

        const amount = ethers.parseEther('100');
        await token.mint(alice.address, amount);

        await token.connect(alice).approve(await depositDex.getAddress(), amount);
        await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

        const withdrawalAmount = ethers.parseEther('10');
        const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now


        const withdrawalOrder = {
            collateral: await token.getAddress(),
            account: alice.address,
            amount: withdrawalAmount,
            session: ethers.ZeroAddress,
            expiration: expiration,
            signature: '0x'
        };

        const withdrawalOrderTypeValueHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes32", "address", "uint256", "address", "uint256"],
                [
                    withdrawalOrderTypeHash,
                    withdrawalOrder.account,
                    withdrawalOrder.amount,
                    withdrawalOrder.session,
                    withdrawalOrder.expiration,
                ]
            )
        )

        const EIP712_DOMAIN_TYPEHASH = ethers.keccak256(
            ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
        );

        const name = "EventHorizon"; // Matches `HASHED_NAME` in the contract
        const version = "1"; // Matches `HASHED_VERSION` in the contract
        const chainId = (await ethers.provider.getNetwork()).chainId; // Current chain ID
        const verifyingContract = await depositDex.getAddress(); // Address of the contract (replace with actual contract address)

        const HASHED_NAME = ethers.keccak256(ethers.toUtf8Bytes(name));
        const HASHED_VERSION = ethers.keccak256(ethers.toUtf8Bytes(version));

        // Encode and hash the domain separator
        const domainSeparator = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes32", "bytes32", "bytes32", "uint256", "address"],
                [EIP712_DOMAIN_TYPEHASH, HASHED_NAME, HASHED_VERSION, chainId, verifyingContract]
            )
        );


        const digest = ethers.keccak256(
            ethers.concat([
                ethers.toUtf8Bytes("\x19\x01"), // EIP-712 prefix
                ethers.getBytes(domainSeparator), // Domain separator
                ethers.getBytes(withdrawalOrderTypeValueHash), // Hash of the struct
            ]))
        const digestHash = ethers.hashMessage(ethers.getBytes(digest))

        const signature = await alice.signMessage(ethers.getBytes(digest));
        const valid = await orderValidationWrapper.isSignatureValid(alice.address, digestHash, signature);

        console.log('\n\n\n\nvalid:', valid)

        const signedWithdrawalOrder = { ...withdrawalOrder, signature };

        console.log(`alice address ${alice.address}`)
        console.log(`digest        ${digest}`)
        console.log(`signature     ${signature}`)

        await depositDex.connect(matcher).withdrawComplete(
            signedWithdrawalOrder,
            [100000000], // fullPrices
            0, // historyTimestamp
            0 // historySearchHint
        )

        // await expect(
        //     depositDex.connect(matcher).withdrawComplete(
        //         signedWithdrawalOrder,
        //         [100000000], // fullPrices
        //         0, // historyTimestamp
        //         0 // historySearchHint
        //     )
        // ).to.emit(depositDex, 'DepositBalanceChanged')
        //     .withArgs(alice.address, await token.getAddress(), -withdrawalAmount, ethers.parseEther('90'));




    });

});