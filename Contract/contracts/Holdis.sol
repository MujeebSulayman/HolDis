// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title Holdis
 * @notice Simple blockchain invoice and payment tracking system
 * @dev Supports direct payments and optional escrow mode for deliverable tracking
 */
contract Holdis is 
    Initializable, 
    UUPSUpgradeable, 
    AccessControlUpgradeable, 
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    enum InvoiceStatus {
        Pending,      // Created, awaiting payment
        Funded,       // Paid, funds in custody
        Delivered,    // (Escrow mode only) Deliverables submitted
        Completed,    // Funds released/withdrawn
        Cancelled     // Cancelled
    }
    
    struct Invoice {
        uint256 id;
        address issuer;         // Who created the invoice
        address payer;          // Who pays
        address receiver;       // Who receives the funds
        uint256 amount;
        address tokenAddress;   // ERC20 token or address(0) for native
        InvoiceStatus status;
        bool requiresDelivery;  // Escrow mode: requires delivery confirmation
        string description;
        string attachmentHash;  // IPFS hash for invoice details
        uint256 createdAt;
        uint256 fundedAt;
        uint256 deliveredAt;
        uint256 completedAt;
    }
    
    struct PlatformSettings {
        uint256 platformFee;        // Basis points (e.g., 250 = 2.5%)
        uint256 maxInvoiceAmount;   // Maximum invoice amount
        uint256 minInvoiceAmount;   // Minimum invoice amount
    }
    
    // State variables
    uint256 private _nextInvoiceId;
    PlatformSettings public platformSettings;
    
    mapping(uint256 => Invoice) public invoices;
    
    // Multi-party tracking
    mapping(address => uint256[]) private _issuerInvoices;
    mapping(address => uint256[]) private _payerInvoices;
    mapping(address => uint256[]) private _receiverInvoices;
    
    // Supported tokens
    mapping(address => bool) public supportedTokens;
    address[] public supportedTokenList;
    
    // Events
    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed issuer,
        address indexed payer,
        address receiver,
        uint256 amount,
        address token,
        bool requiresDelivery,
        uint256 timestamp
    );
    
    event InvoiceStatusUpdated(
        uint256 indexed invoiceId,
        InvoiceStatus oldStatus,
        InvoiceStatus newStatus,
        uint256 timestamp
    );
    
    event InvoiceFunded(
        uint256 indexed invoiceId,
        address indexed payer,
        uint256 amount,
        uint256 timestamp
    );
    
    event DeliverySubmitted(
        uint256 indexed invoiceId,
        address indexed issuer,
        string proofHash,
        uint256 timestamp
    );
    
    event DeliveryConfirmed(
        uint256 indexed invoiceId,
        address indexed receiver,
        uint256 timestamp
    );
    
    event InvoiceCompleted(
        uint256 indexed invoiceId,
        uint256 platformFeeCollected,
        uint256 timestamp
    );
    
    event InvoiceCancelled(
        uint256 indexed invoiceId,
        address indexed cancelledBy,
        string reason,
        uint256 timestamp
    );
    
    event TokenSupported(
        address indexed token,
        bool supported,
        uint256 timestamp
    );
    
    event PlatformSettingsUpdated(
        uint256 platformFee,
        uint256 maxAmount,
        uint256 minAmount,
        uint256 timestamp
    );
    
    // Modifiers
    modifier onlyIssuer(uint256 invoiceId) {
        require(invoices[invoiceId].issuer == msg.sender, "Not issuer");
        _;
    }
    
    modifier onlyPayer(uint256 invoiceId) {
        require(invoices[invoiceId].payer == msg.sender, "Not payer");
        _;
    }
    
    modifier onlyReceiver(uint256 invoiceId) {
        require(invoices[invoiceId].receiver == msg.sender, "Not receiver");
        _;
    }
    
    modifier invoiceExists(uint256 invoiceId) {
        require(invoiceId > 0 && invoiceId < _nextInvoiceId, "Invoice does not exist");
        _;
    }
    
    modifier inStatus(uint256 invoiceId, InvoiceStatus status) {
        require(invoices[invoiceId].status == status, "Invalid status");
        _;
    }
    
    modifier onlySupportedToken(address token) {
        require(supportedTokens[token], "Token not supported");
        _;
    }
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // For production proxy deployment, uncomment the line below
        // _disableInitializers();
    }
    
    function initialize(address admin) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        _nextInvoiceId = 1;
        
        // Default platform settings
        platformSettings = PlatformSettings({
            platformFee: 250,              // 2.5%
            maxInvoiceAmount: 1000000e18,  // 1M tokens
            minInvoiceAmount: 1e18         // 1 token
        });
        
        // Support native token by default
        supportedTokens[address(0)] = true;
        supportedTokenList.push(address(0));
    }
    
    /**
     * @notice Create a new invoice
     * @param payer Address who will pay the invoice
     * @param receiver Address who will receive the funds
     * @param amount Invoice amount
     * @param token Token address (address(0) for native token)
     * @param requiresDelivery True for escrow mode (requires delivery confirmation)
     * @param description Invoice description
     * @param attachmentHash IPFS hash for invoice details/attachments
     */
    function createInvoice(
        address payer,
        address receiver,
        uint256 amount,
        address token,
        bool requiresDelivery,
        string calldata description,
        string calldata attachmentHash
    ) external whenNotPaused onlySupportedToken(token) returns (uint256) {
        require(payer != address(0), "Invalid payer");
        require(receiver != address(0), "Invalid receiver");
        require(amount >= platformSettings.minInvoiceAmount, "Amount below minimum");
        require(amount <= platformSettings.maxInvoiceAmount, "Amount above maximum");
        
        uint256 invoiceId = _nextInvoiceId++;
        
        Invoice storage invoice = invoices[invoiceId];
        invoice.id = invoiceId;
        invoice.issuer = msg.sender;
        invoice.payer = payer;
        invoice.receiver = receiver;
        invoice.amount = amount;
        invoice.tokenAddress = token;
        invoice.status = InvoiceStatus.Pending;
        invoice.requiresDelivery = requiresDelivery;
        invoice.description = description;
        invoice.attachmentHash = attachmentHash;
        invoice.createdAt = block.timestamp;
        
        _issuerInvoices[msg.sender].push(invoiceId);
        _payerInvoices[payer].push(invoiceId);
        _receiverInvoices[receiver].push(invoiceId);
        
        emit InvoiceCreated(
            invoiceId,
            msg.sender,
            payer,
            receiver,
            amount,
            token,
            requiresDelivery,
            block.timestamp
        );
        
        return invoiceId;
    }
    
    /**
     * @notice Mark invoice as funded (backend confirms payment received)
     * @dev Called by payer after payment or by backend
     */
    function markAsFunded(uint256 invoiceId) 
        external 
        whenNotPaused 
        invoiceExists(invoiceId)
        inStatus(invoiceId, InvoiceStatus.Pending)
        nonReentrant
    {
        Invoice storage invoice = invoices[invoiceId];
        
        require(
            msg.sender == invoice.payer || hasRole(ADMIN_ROLE, msg.sender),
            "Only payer or admin"
        );
        
        InvoiceStatus oldStatus = invoice.status;
        invoice.status = InvoiceStatus.Funded;
        invoice.fundedAt = block.timestamp;
        
        emit InvoiceFunded(invoiceId, invoice.payer, invoice.amount, block.timestamp);
        emit InvoiceStatusUpdated(invoiceId, oldStatus, invoice.status, block.timestamp);
        
        // If no delivery required, auto-complete
        if (!invoice.requiresDelivery) {
            _completeInvoice(invoiceId);
        }
    }
    
    /**
     * @notice Submit delivery proof (escrow mode only)
     */
    function submitDelivery(
        uint256 invoiceId,
        string calldata proofHash
    ) external
        whenNotPaused
        invoiceExists(invoiceId)
        inStatus(invoiceId, InvoiceStatus.Funded)
        onlyIssuer(invoiceId)
    {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.requiresDelivery, "Invoice does not require delivery");
        
        InvoiceStatus oldStatus = invoice.status;
        invoice.status = InvoiceStatus.Delivered;
        invoice.deliveredAt = block.timestamp;
        
        emit DeliverySubmitted(invoiceId, msg.sender, proofHash, block.timestamp);
        emit InvoiceStatusUpdated(invoiceId, oldStatus, invoice.status, block.timestamp);
    }
    
    /**
     * @notice Confirm delivery and complete invoice (escrow mode only)
     */
    function confirmDelivery(uint256 invoiceId)
        external
        whenNotPaused
        invoiceExists(invoiceId)
        inStatus(invoiceId, InvoiceStatus.Delivered)
        onlyReceiver(invoiceId)
        nonReentrant
    {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.requiresDelivery, "Invoice does not require delivery");
        
        emit DeliveryConfirmed(invoiceId, msg.sender, block.timestamp);
        
        _completeInvoice(invoiceId);
    }
    
    /**
     * @notice Internal function to complete invoice and calculate fees
     */
    function _completeInvoice(uint256 invoiceId) private {
        Invoice storage invoice = invoices[invoiceId];
        InvoiceStatus oldStatus = invoice.status;
        
        invoice.status = InvoiceStatus.Completed;
        invoice.completedAt = block.timestamp;
        
        // Calculate platform fee
        uint256 platformFee = (invoice.amount * platformSettings.platformFee) / 10000;
        
        emit InvoiceCompleted(invoiceId, platformFee, block.timestamp);
        emit InvoiceStatusUpdated(invoiceId, oldStatus, invoice.status, block.timestamp);
    }
    
    /**
     * @notice Cancel invoice
     */
    function cancelInvoice(
        uint256 invoiceId,
        string calldata reason
    ) external
        whenNotPaused
        invoiceExists(invoiceId)
        nonReentrant
    {
        Invoice storage invoice = invoices[invoiceId];
        
        require(
            msg.sender == invoice.issuer || 
            msg.sender == invoice.payer ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized to cancel"
        );
        
        require(
            invoice.status == InvoiceStatus.Pending,
            "Can only cancel pending invoices"
        );
        
        InvoiceStatus oldStatus = invoice.status;
        invoice.status = InvoiceStatus.Cancelled;
        
        emit InvoiceCancelled(invoiceId, msg.sender, reason, block.timestamp);
        emit InvoiceStatusUpdated(invoiceId, oldStatus, invoice.status, block.timestamp);
    }
    
    // ============ Query Functions ============
    
    function getInvoice(uint256 invoiceId) 
        external 
        view 
        invoiceExists(invoiceId)
        returns (Invoice memory) 
    {
        return invoices[invoiceId];
    }
    
    /**
     * @notice Get invoices with pagination
     */
    function getIssuerInvoices(address issuer, uint256 offset, uint256 limit) 
        external 
        view 
        returns (uint256[] memory, uint256) 
    {
        uint256[] storage allInvoices = _issuerInvoices[issuer];
        return _paginate(allInvoices, offset, limit);
    }
    
    function getPayerInvoices(address payer, uint256 offset, uint256 limit) 
        external 
        view 
        returns (uint256[] memory, uint256) 
    {
        uint256[] storage allInvoices = _payerInvoices[payer];
        return _paginate(allInvoices, offset, limit);
    }
    
    function getReceiverInvoices(address receiver, uint256 offset, uint256 limit) 
        external 
        view 
        returns (uint256[] memory, uint256) 
    {
        uint256[] storage allInvoices = _receiverInvoices[receiver];
        return _paginate(allInvoices, offset, limit);
    }
    
    function _paginate(
        uint256[] storage allInvoices,
        uint256 offset,
        uint256 limit
    ) private view returns (uint256[] memory, uint256) {
        uint256 total = allInvoices.length;
        
        if (offset >= total) {
            return (new uint256[](0), total);
        }
        
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        
        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);
        
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = allInvoices[offset + i];
        }
        
        return (result, total);
    }
    
    function getTotalInvoices() external view returns (uint256) {
        return _nextInvoiceId - 1;
    }
    
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokenList;
    }
    
    // ============ Admin Functions ============
    
    function updatePlatformSettings(
        uint256 platformFee,
        uint256 maxAmount,
        uint256 minAmount
    ) external onlyRole(ADMIN_ROLE) {
        require(platformFee <= 1000, "Fee too high"); // Max 10%
        
        platformSettings.platformFee = platformFee;
        platformSettings.maxInvoiceAmount = maxAmount;
        platformSettings.minInvoiceAmount = minAmount;
        
        emit PlatformSettingsUpdated(platformFee, maxAmount, minAmount, block.timestamp);
    }
    
    function setSupportedToken(address token, bool supported) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        bool currentStatus = supportedTokens[token];
        
        if (supported && !currentStatus) {
            supportedTokens[token] = true;
            supportedTokenList.push(token);
        } else if (!supported && currentStatus) {
            supportedTokens[token] = false;
            // Remove from list
            for (uint256 i = 0; i < supportedTokenList.length; i++) {
                if (supportedTokenList[i] == token) {
                    supportedTokenList[i] = supportedTokenList[supportedTokenList.length - 1];
                    supportedTokenList.pop();
                    break;
                }
            }
        }
        
        emit TokenSupported(token, supported, block.timestamp);
    }
    
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(ADMIN_ROLE) 
    {}
}
