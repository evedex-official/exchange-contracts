// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

struct Order {
  address senderAddress;
  address matcherAddress;
  address collateral;
  uint256 instrumentIndex;
  uint256 amount;
  uint256 price;
  uint16 leverage;
  uint256 matcherFee;
  uint256 expiration;
  uint8 side;
  address userSession;
  bytes32 merkleRoot;
  bytes32[] merkleProof;
  bytes signature;
}

struct PriceData {
  uint256 index;
  uint256 price;
}

struct MultiOrderLiquidation {
  address accountToLiquidate;
  address liquidator;
  address collateral;
  PriceData[] liquidationPrices;
  PriceData[] prices;
  uint16 leverage;
  uint256 liquidationTimestamp;
  uint256 expiration;
  bytes signature;
}

struct OrderLiquidation {
  address accountToLiquidate;
  address liquidator;
  address collateral;
  uint256 index;
  PriceData[] prices;
  uint16 leverage;
  uint256 liquidationTimestamp;
  uint256 expiration;
  bytes signature;
}

struct OrderWithdrawal {
  address collateral;
  address account;
  uint256 amount;
  address session;
  uint256 expiration;
  bytes signature;
}

library OrderValidationLib {
  error DifferentInstruments();
  error DifferentMatchers();
  error InstrumentOutOfIndex();
  error InvalidAmount();
  error InvalidDealSide();
  error InvalidExpiration();
  error InvalidLeverage();
  error InvalidMatcher();
  error InvalidPrice();
  error InvalidSignature();
  error InvalidMerkleTree();

  bytes32 public constant HASHED_NAME = keccak256(bytes("EVEDEX"));
  bytes32 public constant HASHED_VERSION = keccak256(bytes("1"));

  bytes32 public constant EIP712_DOMAIN_TYPEHASH =
    keccak256(abi.encodePacked("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));

  function buildDomainSeparator() public view returns (bytes32) {
    return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, HASHED_NAME, HASHED_VERSION, block.chainid, address(this)));
  }

  bytes32 public constant ORDER_TYPEHASH =
    keccak256(
      abi.encodePacked(
        "Order(address senderAddress,address matcherAddress,address collateral,uint256 instrumentIndex,uint256 amount,uint256 price,uint16 leverage,uint256 matcherFee,uint256 expiration,uint8 side)"
      )
    );

  bytes32 public constant MULTI_ORDER_TYPEHASH = keccak256(abi.encodePacked("MultiOrder(bytes32 merkleRoot)"));

  bytes32 public constant PRICE_INFO_TYPEHASH = keccak256(abi.encodePacked("PriceData(uint256 index,uint256 price)"));

  bytes32 public constant MULTI_ORDER_LIQUIDATION_TYPEHASH =
    keccak256(
      abi.encodePacked(
        "MultiOrderLiquidation(address accountToLiquidate,address liquidator,PriceData[] liquidationPrices,PriceData[] prices,uint16 leverage,uint256 liquidationTimestamp,uint256 expiration)PriceData(uint256 index,uint256 price)"
      )
    );

  bytes32 public constant LIQUIDATION_ORDER_TYPEHASH =
    keccak256(
      abi.encodePacked(
        "OrderLiquidation(address accountToLiquidate,address liquidator,uint256 index,PriceData[] prices,uint16 leverage,uint256 liquidationTimestamp,uint256 expiration)PriceData(uint256 index,uint256 price)"
      )
    );

  bytes32 public constant WITHDRAWAL_ORDER_TYPEHASH =
    keccak256(
      abi.encodePacked(
        "OrderWithdrawal(address collateral,address account,uint256 amount,address session,uint256 expiration)"
      )
    );

  function _getOrderTypeValueHash(Order memory _order) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          ORDER_TYPEHASH,
          _order.senderAddress,
          _order.matcherAddress,
          _order.collateral,
          _order.instrumentIndex,
          _order.amount,
          _order.price,
          _order.leverage,
          _order.matcherFee,
          _order.expiration,
          _order.side
        )
      );
  }

  function _getMultiOrderTypeValueHash(Order memory _order) internal pure returns (bytes32) {
    return keccak256(abi.encode(MULTI_ORDER_TYPEHASH, _order.merkleRoot));
  }

  function _getOrderTypeValueHashWithoutLeverage(Order memory _order) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          ORDER_TYPEHASH,
          _order.senderAddress,
          _order.matcherAddress,
          _order.instrumentIndex,
          _order.amount,
          _order.price,
          _order.matcherFee,
          _order.expiration,
          _order.side
        )
      );
  }

  function _getPriceDataTypeValueHash(PriceData memory _priceData) internal pure returns (bytes32) {
    return keccak256(abi.encode(PRICE_INFO_TYPEHASH, _priceData.index, _priceData.price));
  }

  function _getMultiLiquidationOrderTypeValueHash(
    MultiOrderLiquidation memory _liquidationOrder
  ) internal pure returns (bytes32) {
    uint256 liquidationPricesLen = _liquidationOrder.liquidationPrices.length;
    bytes32[] memory encodedLiquidationPrices = new bytes32[](liquidationPricesLen);
    for (uint256 i = 0; i < liquidationPricesLen; ++i) {
      encodedLiquidationPrices[i] = _getPriceDataTypeValueHash(_liquidationOrder.liquidationPrices[i]);
    }
    uint256 pricesLen = _liquidationOrder.prices.length;
    bytes32[] memory encodedPrices = new bytes32[](pricesLen);
    for (uint256 i = 0; i < pricesLen; ++i) {
      encodedPrices[i] = _getPriceDataTypeValueHash(_liquidationOrder.prices[i]);
    }
    return
      keccak256(
        abi.encode(
          MULTI_ORDER_LIQUIDATION_TYPEHASH,
          _liquidationOrder.accountToLiquidate,
          _liquidationOrder.liquidator,
          keccak256(abi.encodePacked(encodedLiquidationPrices)),
          keccak256(abi.encodePacked(encodedPrices)),
          _liquidationOrder.leverage,
          _liquidationOrder.liquidationTimestamp,
          _liquidationOrder.expiration
        )
      );
  }

  function _getLiquidationOrderTypeValueHash(
    OrderLiquidation memory _liquidationOrder
  ) internal pure returns (bytes32) {
    uint256 len = _liquidationOrder.prices.length;
    bytes32[] memory encodedPrices = new bytes32[](len);
    for (uint256 i = 0; i < len; ++i) {
      encodedPrices[i] = _getPriceDataTypeValueHash(_liquidationOrder.prices[i]);
    }
    return
      keccak256(
        abi.encode(
          LIQUIDATION_ORDER_TYPEHASH,
          _liquidationOrder.accountToLiquidate,
          _liquidationOrder.liquidator,
          _liquidationOrder.index,
          keccak256(abi.encodePacked(encodedPrices)),
          _liquidationOrder.leverage,
          _liquidationOrder.liquidationTimestamp,
          _liquidationOrder.expiration
        )
      );
  }

  function _getWithdrawalOrderTypeValueHash(OrderWithdrawal memory _withdrawalOrder) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          WITHDRAWAL_ORDER_TYPEHASH,
          _withdrawalOrder.collateral,
          _withdrawalOrder.account,
          _withdrawalOrder.amount,
          _withdrawalOrder.session,
          _withdrawalOrder.expiration
        )
      );
  }

  function _getOrderDigest(Order memory order) public view returns (bytes32) {
    return keccak256(abi.encodePacked("\x19\x01", buildDomainSeparator(), _getOrderTypeValueHash(order)));
  }

  function _getMultiOrderDigest(Order memory order) public view returns (bytes32, bytes32) {
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getMultiOrderTypeValueHash(order))
    );
    bytes32 leaf = keccak256(bytes.concat(_getOrderTypeValueHash(order)));
    return (digest, leaf);
  }

  function _checkExpiration(uint256 expirationTimestamp, uint256 currentTimestamp) internal pure {
    if (expirationTimestamp < currentTimestamp) revert InvalidExpiration();
  }

  function _checkSignature(address signer, bytes32 digest, bytes memory signature) internal view {
    if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature();
  }

  function _checkMerkleTree(bytes32[] memory proof, bytes32 root, bytes32 leaf) internal pure {
    if (!MerkleProof.verify(proof, root, leaf)) revert InvalidMerkleTree();
  }

  function checkLiquidationOrder(OrderLiquidation memory liquidationOrder, uint256 historyTimestamp) public view {
    _checkExpiration(liquidationOrder.expiration, historyTimestamp);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getLiquidationOrderTypeValueHash(liquidationOrder))
    );
    _checkSignature(liquidationOrder.liquidator, digest, liquidationOrder.signature);
  }

  function checkLiquidationOrder(MultiOrderLiquidation memory liquidationOrder, uint256 historyTimestamp) public view {
    _checkExpiration(liquidationOrder.expiration, historyTimestamp);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getMultiLiquidationOrderTypeValueHash(liquidationOrder))
    );
    _checkSignature(liquidationOrder.liquidator, digest, liquidationOrder.signature);
  }

  function checkWithdrawalOrder(OrderWithdrawal memory withdrawalOrder, address orderSigner) public view {
    _checkExpiration(withdrawalOrder.expiration, block.timestamp);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getWithdrawalOrderTypeValueHash(withdrawalOrder))
    );
    _checkSignature(orderSigner, digest, withdrawalOrder.signature);
  }

  function checkOrdersInfo(
    Order memory buyOrder,
    Order memory sellOrder,
    address buyOrderSigner,
    address sellOrderSigner,
    address sender,
    uint256 filledAmount,
    uint256 filledPrice,
    address allowedMatcher,
    uint256 instrumentsLength,
    uint256 historyTimestamp
  ) public view returns (bytes32 buyOrderDigest, bytes32 sellOrderDigest) {
    _checkExpiration(buyOrder.expiration, historyTimestamp);
    _checkExpiration(sellOrder.expiration, historyTimestamp);

    if (buyOrder.merkleRoot != 0x00) {
      bytes32 buyOrderLeaf;
      (buyOrderDigest, buyOrderLeaf) = _getMultiOrderDigest(buyOrder);
      _checkMerkleTree(buyOrder.merkleProof, buyOrder.merkleRoot, buyOrderLeaf);
    } else {
      buyOrderDigest = _getOrderDigest(buyOrder);
    }

    if (sellOrder.merkleRoot != 0x00) {
      bytes32 sellOrderLeaf;
      (sellOrderDigest, sellOrderLeaf) = _getMultiOrderDigest(sellOrder);
      _checkMerkleTree(sellOrder.merkleProof, sellOrder.merkleRoot, sellOrderLeaf);
    } else {
      sellOrderDigest = _getOrderDigest(sellOrder);
    }

    _checkSignature(buyOrderSigner, buyOrderDigest, buyOrder.signature);
    _checkSignature(sellOrderSigner, sellOrderDigest, sellOrder.signature);

    if (buyOrder.instrumentIndex != sellOrder.instrumentIndex) revert DifferentInstruments();
    if (instrumentsLength <= buyOrder.instrumentIndex) revert InstrumentOutOfIndex();
    if (!(buyOrder.matcherAddress == sender && sellOrder.matcherAddress == sender)) revert DifferentMatchers();
    if (buyOrder.matcherAddress != allowedMatcher) revert InvalidMatcher();
    if (filledAmount > buyOrder.amount || filledAmount > sellOrder.amount) revert InvalidAmount();
    if (filledPrice > buyOrder.price || filledPrice < sellOrder.price) revert InvalidPrice();
    if (buyOrder.side != 1 && sellOrder.side != 0) revert InvalidDealSide();
    if (buyOrder.leverage == 0 || sellOrder.leverage == 0) revert InvalidLeverage();
    buyOrderDigest = _getOrderTypeValueHashWithoutLeverage(buyOrder);
    sellOrderDigest = _getOrderTypeValueHashWithoutLeverage(sellOrder);
  }
}
