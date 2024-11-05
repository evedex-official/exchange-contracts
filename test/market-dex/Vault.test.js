const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('Testing Vault contract', function () {
  let Vault, vault, vaultAddress, MockToken, token, tokenAddress;

  beforeEach(async function () {
    const [owner] = await ethers.getSigners();

    Vault = await ethers.getContractFactory('EvenHorizonVault');
    vault = await Vault.deploy(owner.address);
    vaultAddress = await vault.getAddress();

    MockToken = await ethers.getContractFactory('ERC20Mock');
    token = await MockToken.deploy();
    tokenAddress = await token.getAddress();
    await token.mint(vaultAddress, 1000);
  });

  it('Checking auth withdraw', async function () {
    const [owner, alice] = await ethers.getSigners();

    const balanceBefore = await token.balanceOf(vaultAddress);
    const aliceBefore = await token.balanceOf(alice.address);
    const amountToWithdraw = 100;

    const withdrawRole = await vault.WITHDRAWER_ROLE();
    await expect(vault.connect(alice).withdrawAuthorized(tokenAddress, amountToWithdraw))
      .to.be.revertedWithCustomError(Vault, 'AccessControlUnauthorizedAccount')
      .withArgs(alice.address, withdrawRole);
    await vault.connect(owner).grantRole(withdrawRole, alice.address);
    expect(await vault.connect(alice).withdrawAuthorized(tokenAddress, amountToWithdraw))
      .to.emit(Vault, 'AuthorizedWithdraw')
      .withArgs(alice.address, tokenAddress, amountToWithdraw);

    const balanceAfter = await token.balanceOf(vaultAddress);
    const aliceAfter = await token.balanceOf(alice.address);
    expect(balanceBefore - balanceAfter).to.be.equal(amountToWithdraw);
    expect(aliceAfter - aliceBefore).to.be.equal(amountToWithdraw);
  });

  it('Checking native withdraw', async function () {
    const [owner, alice] = await ethers.getSigners();

    const amountETH = ethers.parseEther('0.1');
    const withdrawRole = await vault.WITHDRAWER_ROLE();
    const ethBalBefore = await ethers.provider.getBalance(vaultAddress);
    await expect(owner.sendTransaction({ to: vaultAddress, value: amountETH })).not.to.be.reverted;
    const ethAfter = await ethers.provider.getBalance(vaultAddress);
    expect(ethAfter - ethBalBefore).to.be.equal(amountETH);

    const addressETH = await vault.ETH_ADDRESS();
    await vault.connect(owner).grantRole(withdrawRole, alice.address);
    await vault.connect(alice).withdrawAuthorized(addressETH, amountETH);
    const ethAfterAfter = await ethers.provider.getBalance(vaultAddress);
    expect(ethAfterAfter).to.be.equal(ethBalBefore);
  });

  it('Checking auth list', async function () {
    const [owner, alice] = await ethers.getSigners();

    const withdrawRole = await vault.WITHDRAWER_ROLE();
    const pauserRole = await vault.PAUSER_ROLE();
    const adminRole = ethers.ZeroHash;

    await vault.connect(owner).grantRole(withdrawRole, alice.address);

    expect(await vault.getRoleMemberCount(adminRole)).to.be.equal(1);
    expect(await vault.getRoleMemberCount(withdrawRole)).to.be.equal(1);
    expect(await vault.getRoleMemberCount(pauserRole)).to.be.equal(1);

    expect(await vault.getRoleMember(adminRole, 0)).to.be.equal(owner.address);
    expect(await vault.getRoleMember(withdrawRole, 0)).to.be.equal(alice.address);
    expect(await vault.getRoleMember(pauserRole, 0)).to.be.equal(owner.address);
  });

  it('Checking pause withdraw', async function () {
    const [owner, alice, bob] = await ethers.getSigners();

    const withdrawRole = await vault.WITHDRAWER_ROLE();
    const pauserRole = await vault.PAUSER_ROLE();
    const adminRole = ethers.ZeroHash;
    const amountToWithdraw = 100;
    await vault.connect(owner).grantRole(withdrawRole, alice.address);
    await vault.connect(owner).grantRole(pauserRole, bob.address);

    await expect(vault.connect(alice).withdrawAuthorized(tokenAddress, amountToWithdraw)).not.to.be.reverted;
    await vault.connect(bob).pause();
    await expect(vault.connect(alice).withdrawAuthorized(tokenAddress, amountToWithdraw)).to.be.revertedWithCustomError(
      Vault,
      'EnforcedPause',
    );
    await expect(vault.connect(bob).unpause())
      .to.be.revertedWithCustomError(Vault, 'AccessControlUnauthorizedAccount')
      .withArgs(bob.address, adminRole);

    await vault.connect(owner).unpause();
    await expect(vault.connect(alice).withdrawAuthorized(tokenAddress, amountToWithdraw)).not.to.be.reverted;
  });
});
