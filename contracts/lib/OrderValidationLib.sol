// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

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
  error InvalidMatcher();
  error InvalidPrice();
  error InvalidSignature();

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
        "Order(address senderAddress,address matcherAddress,uint256 instrumentIndex,uint256 amount,uint256 price,uint16 leverage,uint256 matcherFee,uint256 expiration,uint8 side)"
      )
    );

  bytes32 public constant PRICE_INFO_TYPEHASH = keccak256(abi.encodePacked("PriceData(uint256 index,uint256 price)"));

  bytes32 public constant MULTI_ORDER_LIQUIDATION_TYPEHASH =
    keccak256(
      abi.encodePacked(
        "MultiOrderLiquidation(address accountToLiquidate,address liquidator,PriceData[] liquidationPrices,PriceData[] prices,uint256 liquidationTimestamp,uint256 expiration)PriceData(uint256 index,uint256 price)"
      )
    );

  bytes32 public constant LIQUIDATION_ORDER_TYPEHASH =
    keccak256(
      abi.encodePacked(
        "OrderLiquidation(address accountToLiquidate,address liquidator,uint256 index,PriceData[] prices,uint256 liquidationTimestamp,uint256 expiration)PriceData(uint256 index,uint256 price)"
      )
    );

  bytes32 public constant WITHDRAWAL_ORDER_TYPEHASH =
    keccak256(abi.encodePacked("OrderWithdrawal(address account,uint256 amount,address session,uint256 expiration)"));

  function _getOrderTypeValueHash(Order memory _order) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          ORDER_TYPEHASH,
          _order.senderAddress,
          _order.matcherAddress,
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

  function _getOrderDigestWithoutLeverage(Order memory order) public view returns (bytes32) {
    return
      keccak256(abi.encodePacked("\x19\x01", buildDomainSeparator(), _getOrderTypeValueHashWithoutLeverage(order)));
  }

  function _checkExpiration(uint256 timestamp) internal view {
    if (timestamp < block.timestamp) revert InvalidExpiration();
  }

  function _checkSignature(address signer, bytes32 digest, bytes memory signature) internal view {
    if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature();
  }

  function checkLiquidationOrder(OrderLiquidation memory liquidationOrder) public view {
    _checkExpiration(liquidationOrder.expiration);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getLiquidationOrderTypeValueHash(liquidationOrder))
    );
    _checkSignature(liquidationOrder.liquidator, digest, liquidationOrder.signature);
  }

  function checkLiquidationOrder(MultiOrderLiquidation memory liquidationOrder) public view {
    _checkExpiration(liquidationOrder.expiration);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getMultiLiquidationOrderTypeValueHash(liquidationOrder))
    );
    _checkSignature(liquidationOrder.liquidator, digest, liquidationOrder.signature);
  }

  function checkWithdrawalOrder(OrderWithdrawal memory withdrawalOrder, address orderSigner) public view {
    _checkExpiration(withdrawalOrder.expiration);
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
    uint256 instrumentsLength
  ) public view returns (bytes32 buyOrderDigest, bytes32 sellOrderDigest) {
    _checkExpiration(buyOrder.expiration);
    _checkExpiration(sellOrder.expiration);

    buyOrderDigest = _getOrderDigest(buyOrder);
    sellOrderDigest = _getOrderDigest(sellOrder);
    _checkSignature(buyOrderSigner, buyOrderDigest, buyOrder.signature);
    _checkSignature(sellOrderSigner, sellOrderDigest, sellOrder.signature);

    if (buyOrder.instrumentIndex != sellOrder.instrumentIndex) revert DifferentInstruments();
    if (instrumentsLength <= buyOrder.instrumentIndex) revert InstrumentOutOfIndex();
    if (!(buyOrder.matcherAddress == sender && sellOrder.matcherAddress == sender)) revert DifferentMatchers();
    if (buyOrder.matcherAddress != allowedMatcher) revert InvalidMatcher();
    if (filledAmount > buyOrder.amount || filledAmount > sellOrder.amount) revert InvalidAmount();
    if (filledPrice > buyOrder.price || filledPrice < sellOrder.price) revert InvalidPrice();
    if (buyOrder.side != 1 && sellOrder.side != 0) revert InvalidDealSide();
    buyOrderDigest = _getOrderDigestWithoutLeverage(buyOrder);
    sellOrderDigest = _getOrderDigestWithoutLeverage(sellOrder);
  }
}
