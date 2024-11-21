const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deployProxyWithLibraries, deployWithLibraries } = require('./helpers/deploy-utils');

describe('EVEDEX contract', function () {

    let depositDex, vault, eveDex, sessions;

    beforeEach(async function () {
        const [owner, alice, bob, liquidator, fundingRateAccount, matcher] = await ethers.getSigners();

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
    });


    it('should run EVEDEX test', async function () {
        
    })

});