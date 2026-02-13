// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title InvoiceEscrow
 * @notice Production-grade blockchain invoice and escrow state registry
 * @dev Enterprise features: multi-token, disputes, partial payments, batch ops, auto-timeouts
 */
contract InvoiceEscrow is 
    Initializable, 
    UUPSUpgradeable, 
    AccessControlUpgradeable, 
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    
    enum InvoiceStatus {
        Draft,           // Created but not sent
        Pending,         // Sent, awaiting payment
        PartiallyPaid,   // Partially funded
        Funded,          // Fully funded
        Delivered,       // Goods/services delivered
        Disputed,        // Under dispute
        Completed,       // Successfully completed
        Refunded,        // Refunded to payer
        Cancelled,       // Cancelled
        Expired          // Expired (past due date)
    }
    
    enum DisputeStatus {
        None,
        Raised,
        UnderReview,
        ResolvedForIssuer,
        ResolvedForPayer,
        Cancelled
    }
    
    struct InvoiceMetadata {
        string description;
        string category;        // e.g., "goods", "services", "subscription"
        string attachmentHash;  // IPFS hash for invoice document
        bytes32 termsHash;      // Hash of terms and conditions
    }
    
    struct PaymentTerms {
        uint256 dueDate;              // Unix timestamp
        uint256 lateFeePerDay;        // Basis points (100 = 1%)
        uint256 earlyPaymentDiscount; // Basis points
        uint256 earlyPaymentDeadline; // Unix timestamp
        bool allowPartialPayment;
        uint256 minimumPartialAmount;
    }
    
    struct Agreement {
        uint256 id;
        address issuer;
        address payer;
        address receiver;
        uint256 totalAmount;
        uint256 paidAmount;
        address tokenAddress;        // ERC20 token or address(0) for native
        InvoiceStatus status;
        PaymentTerms terms;
        InvoiceMetadata metadata;
        uint256 createdAt;
        uint256 fundedAt;
        uint256 deliveredAt;
        uint256 completedAt;
        uint256 lastModifiedAt;
        bool isRecurring;
        uint256 recurringInterval;   // In seconds (e.g., 2592000 for monthly)
        uint256 nextRecurringDate;
    }
    
    struct Dispute {
        uint256 invoiceId;
        address initiator;
        DisputeStatus status;
        string reason;
        string resolution;
        address arbiter;
        uint256 raisedAt;
        uint256 resolvedAt;
        uint256 refundAmount;
    }
    
    struct PlatformSettings {
        uint256 platformFee;              // Basis points (e.g., 250 = 2.5%)
        uint256 maxInvoiceAmount;         // Maximum invoice amount
        uint256 minInvoiceAmount;         // Minimum invoice amount
        uint256 defaultDisputePeriod;     // Time window for disputes (seconds)
        uint256 autoCompleteTimeout;      // Auto-complete if no action (seconds)
        bool requireKYC;                  // Require KYC for large amounts
        uint256 kycThreshold;             // Amount requiring KYC
    }
    
    // State variables
    uint256 private _nextInvoiceId;
    uint256 private _nextDisputeId;
    PlatformSettings public platformSettings;
    
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => uint256) public invoiceToDispute;
    
    // Multi-party tracking
    mapping(address => uint256[]) private _issuerInvoices;
    mapping(address => uint256[]) private _payerInvoices;
    mapping(address => uint256[]) private _receiverInvoices;
    
    // Supported tokens
    mapping(address => bool) public supportedTokens;
    address[] public supportedTokenList;
    
    // KYC tracking
    mapping(address => bool) public kycVerified;
    
    // Payment tracking
    mapping(uint256 => mapping(uint256 => uint256)) public paymentHistory; // invoiceId => timestamp => amount
    
    // Template system
    mapping(bytes32 => InvoiceMetadata) public invoiceTemplates;
    mapping(bytes32 => PaymentTerms) public termsTemplates;
    
    // Events
    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed issuer,
        address indexed payer,
        address receiver,
        uint256 amount,
        address token,
        uint256 timestamp
    );
    
    event InvoiceUpdated(
        uint256 indexed invoiceId,
        InvoiceStatus oldStatus,
        InvoiceStatus newStatus,
        uint256 timestamp
    );
    
    event InvoiceFunded(
        uint256 indexed invoiceId,
        address indexed payer,
        uint256 amount,
        uint256 totalPaid,
        uint256 timestamp
    );
    
    event PartialPayment(
        uint256 indexed invoiceId,
        address indexed payer,
        uint256 amount,
        uint256 remaining,
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
    
    event DisputeRaised(
        uint256 indexed disputeId,
        uint256 indexed invoiceId,
        address indexed initiator,
        string reason,
        uint256 timestamp
    );
    
    event DisputeResolved(
        uint256 indexed disputeId,
        uint256 indexed invoiceId,
        DisputeStatus resolution,
        address arbiter,
        uint256 timestamp
    );
    
    event InvoiceCancelled(
        uint256 indexed invoiceId,
        address indexed cancelledBy,
        string reason,
        uint256 timestamp
    );
    
    event InvoiceExpired(
        uint256 indexed invoiceId,
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
    
    event KYCUpdated(
        address indexed user,
        bool verified,
        uint256 timestamp
    );
    
    event RecurringInvoiceCreated(
        uint256 indexed originalInvoiceId,
        uint256 indexed newInvoiceId,
        uint256 timestamp
    );
    
    // Modifiers
    modifier onlyIssuer(uint256 invoiceId) {
        require(agreements[invoiceId].issuer == msg.sender, "Not issuer");
        _;
    }
    
    modifier onlyPayer(uint256 invoiceId) {
        require(agreements[invoiceId].payer == msg.sender, "Not payer");
        _;
    }
    
    modifier onlyReceiver(uint256 invoiceId) {
        require(agreements[invoiceId].receiver == msg.sender, "Not receiver");
        _;
    }
    
    modifier invoiceExists(uint256 invoiceId) {
        require(invoiceId > 0 && invoiceId < _nextInvoiceId, "Invoice does not exist");
        _;
    }
    
    modifier inStatus(uint256 invoiceId, InvoiceStatus status) {
        require(agreements[invoiceId].status == status, "Invalid status");
        _;
    }
    
    modifier notInStatus(uint256 invoiceId, InvoiceStatus status) {
        require(agreements[invoiceId].status != status, "Invalid status for operation");
        _;
    }
    
    modifier onlySupportedToken(address token) {
        require(supportedTokens[token], "Token not supported");
        _;
    }
    
    modifier checkKYC(uint256 amount) {
        if (platformSettings.requireKYC && amount >= platformSettings.kycThreshold) {
            require(kycVerified[msg.sender], "KYC required for this amount");
        }
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
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(ARBITER_ROLE, admin);
        
        _nextInvoiceId = 1;
        _nextDisputeId = 1;
        
        // Default platform settings
        platformSettings = PlatformSettings({
            platformFee: 250,              // 2.5%
            maxInvoiceAmount: 1000000e18,  // 1M tokens
            minInvoiceAmount: 1e18,        // 1 token
            defaultDisputePeriod: 14 days,
            autoCompleteTimeout: 30 days,
            requireKYC: false,
            kycThreshold: 100000e18        // 100K tokens
        });
        
        // Support native token by default
        supportedTokens[address(0)] = true;
        supportedTokenList.push(address(0));
    }
    
    /**
     * @notice Create a new invoice with full payment terms
     */
    function createInvoice(
        address payer,
        address receiver,
        uint256 amount,
        address token,
        PaymentTerms memory terms,
        InvoiceMetadata memory metadata,
        bool isRecurring,
        uint256 recurringInterval
    ) public whenNotPaused onlySupportedToken(token) checkKYC(amount) returns (uint256) {
        require(payer != address(0), "Invalid payer");
        require(receiver != address(0), "Invalid receiver");
        require(amount >= platformSettings.minInvoiceAmount, "Amount below minimum");
        require(amount <= platformSettings.maxInvoiceAmount, "Amount above maximum");
        require(terms.dueDate > block.timestamp, "Due date must be in future");
        
        uint256 invoiceId = _nextInvoiceId++;
        
        Agreement storage agreement = agreements[invoiceId];
        agreement.id = invoiceId;
        agreement.issuer = msg.sender;
        agreement.payer = payer;
        agreement.receiver = receiver;
        agreement.totalAmount = amount;
        agreement.paidAmount = 0;
        agreement.tokenAddress = token;
        agreement.status = InvoiceStatus.Pending;
        agreement.terms = terms;
        agreement.metadata = metadata;
        agreement.createdAt = block.timestamp;
        agreement.lastModifiedAt = block.timestamp;
        agreement.isRecurring = isRecurring;
        agreement.recurringInterval = recurringInterval;
        
        if (isRecurring) {
            agreement.nextRecurringDate = block.timestamp + recurringInterval;
        }
        
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
            block.timestamp
        );
        
        return invoiceId;
    }
    
    /**
     * @notice Create invoice from template
     */
    function createInvoiceFromTemplate(
        address payer,
        address receiver,
        uint256 amount,
        address token,
        bytes32 metadataTemplateId,
        bytes32 termsTemplateId
    ) external whenNotPaused returns (uint256) {
        InvoiceMetadata memory metadata = invoiceTemplates[metadataTemplateId];
        PaymentTerms memory terms = termsTemplates[termsTemplateId];
        
        return createInvoice(
            payer,
            receiver,
            amount,
            token,
            terms,
            metadata,
            false,
            0
        );
    }
    
    /**
     * @notice Mark invoice as funded (full or partial payment)
     */
    function markAsFunded(
        uint256 invoiceId,
        uint256 amount
    ) external 
        whenNotPaused 
        invoiceExists(invoiceId)
        onlyPayer(invoiceId)
        nonReentrant
    {
        Agreement storage agreement = agreements[invoiceId];
        
        require(
            agreement.status == InvoiceStatus.Pending || 
            agreement.status == InvoiceStatus.PartiallyPaid,
            "Invalid status for payment"
        );
        
        require(amount > 0, "Amount must be positive");
        require(agreement.paidAmount + amount <= agreement.totalAmount, "Exceeds total amount");
        
        // Check partial payment rules
        if (amount < agreement.totalAmount - agreement.paidAmount) {
            require(agreement.terms.allowPartialPayment, "Partial payments not allowed");
            require(amount >= agreement.terms.minimumPartialAmount, "Below minimum partial amount");
        }
        
        agreement.paidAmount += amount;
        paymentHistory[invoiceId][block.timestamp] = amount;
        
        InvoiceStatus oldStatus = agreement.status;
        
        if (agreement.paidAmount >= agreement.totalAmount) {
            agreement.status = InvoiceStatus.Funded;
            agreement.fundedAt = block.timestamp;
            
            emit InvoiceFunded(
                invoiceId,
                msg.sender,
                amount,
                agreement.paidAmount,
                block.timestamp
            );
        } else {
            agreement.status = InvoiceStatus.PartiallyPaid;
            
            emit PartialPayment(
                invoiceId,
                msg.sender,
                amount,
                agreement.totalAmount - agreement.paidAmount,
                block.timestamp
            );
        }
        
        agreement.lastModifiedAt = block.timestamp;
        
        emit InvoiceUpdated(invoiceId, oldStatus, agreement.status, block.timestamp);
    }
    
    /**
     * @notice Submit delivery proof
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
        Agreement storage agreement = agreements[invoiceId];
        InvoiceStatus oldStatus = agreement.status;
        agreement.status = InvoiceStatus.Delivered;
        agreement.deliveredAt = block.timestamp;
        agreement.lastModifiedAt = block.timestamp;
        
        emit DeliverySubmitted(invoiceId, msg.sender, proofHash, block.timestamp);
        emit InvoiceUpdated(invoiceId, oldStatus, agreement.status, block.timestamp);
    }
    
    /**
     * @notice Confirm delivery and complete invoice
     */
    function confirmDelivery(uint256 invoiceId)
        external
        whenNotPaused
        invoiceExists(invoiceId)
        inStatus(invoiceId, InvoiceStatus.Delivered)
        onlyReceiver(invoiceId)
        nonReentrant
    {
        Agreement storage agreement = agreements[invoiceId];
        InvoiceStatus oldStatus = agreement.status;
        agreement.status = InvoiceStatus.Completed;
        agreement.completedAt = block.timestamp;
        agreement.lastModifiedAt = block.timestamp;
        
        // Calculate platform fee
        uint256 platformFee = (agreement.totalAmount * platformSettings.platformFee) / 10000;
        
        emit DeliveryConfirmed(invoiceId, msg.sender, block.timestamp);
        emit InvoiceCompleted(invoiceId, platformFee, block.timestamp);
        emit InvoiceUpdated(invoiceId, oldStatus, agreement.status, block.timestamp);
        
        // Handle recurring invoice
        if (agreement.isRecurring && block.timestamp >= agreement.nextRecurringDate) {
            _createRecurringInvoice(invoiceId);
        }
    }
    
    /**
     * @notice Auto-complete invoice after timeout (operator only)
     */
    function autoCompleteInvoice(uint256 invoiceId)
        external
        whenNotPaused
        invoiceExists(invoiceId)
        inStatus(invoiceId, InvoiceStatus.Delivered)
        onlyRole(OPERATOR_ROLE)
    {
        Agreement storage agreement = agreements[invoiceId];
        
        require(
            block.timestamp >= agreement.deliveredAt + platformSettings.autoCompleteTimeout,
            "Timeout not reached"
        );
        
        InvoiceStatus oldStatus = agreement.status;
        agreement.status = InvoiceStatus.Completed;
        agreement.completedAt = block.timestamp;
        agreement.lastModifiedAt = block.timestamp;
        
        uint256 platformFee = (agreement.totalAmount * platformSettings.platformFee) / 10000;
        
        emit InvoiceCompleted(invoiceId, platformFee, block.timestamp);
        emit InvoiceUpdated(invoiceId, oldStatus, agreement.status, block.timestamp);
    }
    
    /**
     * @notice Raise a dispute
     */
    function raiseDispute(
        uint256 invoiceId,
        string calldata reason
    ) external
        whenNotPaused
        invoiceExists(invoiceId)
        nonReentrant
    {
        Agreement storage agreement = agreements[invoiceId];
        
        require(
            msg.sender == agreement.issuer || 
            msg.sender == agreement.payer || 
            msg.sender == agreement.receiver,
            "Not authorized"
        );
        
        require(
            agreement.status == InvoiceStatus.Funded || 
            agreement.status == InvoiceStatus.Delivered,
            "Cannot dispute at this stage"
        );
        
        require(invoiceToDispute[invoiceId] == 0, "Dispute already exists");
        
        uint256 disputeId = _nextDisputeId++;
        
        Dispute storage dispute = disputes[disputeId];
        dispute.invoiceId = invoiceId;
        dispute.initiator = msg.sender;
        dispute.status = DisputeStatus.Raised;
        dispute.reason = reason;
        dispute.raisedAt = block.timestamp;
        
        invoiceToDispute[invoiceId] = disputeId;
        
        InvoiceStatus oldStatus = agreement.status;
        agreement.status = InvoiceStatus.Disputed;
        agreement.lastModifiedAt = block.timestamp;
        
        emit DisputeRaised(disputeId, invoiceId, msg.sender, reason, block.timestamp);
        emit InvoiceUpdated(invoiceId, oldStatus, agreement.status, block.timestamp);
    }
    
    /**
     * @notice Resolve dispute (arbiter only)
     */
    function resolveDispute(
        uint256 disputeId,
        DisputeStatus resolution,
        string calldata resolutionDetails,
        uint256 refundAmount
    ) external
        whenNotPaused
        onlyRole(ARBITER_ROLE)
        nonReentrant
    {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Raised || dispute.status == DisputeStatus.UnderReview, "Invalid dispute status");
        
        uint256 invoiceId = dispute.invoiceId;
        Agreement storage agreement = agreements[invoiceId];
        
        require(refundAmount <= agreement.paidAmount, "Refund exceeds paid amount");
        
        dispute.status = resolution;
        dispute.resolution = resolutionDetails;
        dispute.arbiter = msg.sender;
        dispute.resolvedAt = block.timestamp;
        dispute.refundAmount = refundAmount;
        
        InvoiceStatus oldStatus = agreement.status;
        InvoiceStatus newStatus;
        
        if (resolution == DisputeStatus.ResolvedForPayer) {
            newStatus = refundAmount == agreement.paidAmount ? InvoiceStatus.Refunded : InvoiceStatus.PartiallyPaid;
            agreement.paidAmount -= refundAmount;
        } else if (resolution == DisputeStatus.ResolvedForIssuer) {
            newStatus = InvoiceStatus.Completed;
            agreement.completedAt = block.timestamp;
        } else {
            newStatus = InvoiceStatus.Cancelled;
        }
        
        agreement.status = newStatus;
        agreement.lastModifiedAt = block.timestamp;
        
        emit DisputeResolved(disputeId, invoiceId, resolution, msg.sender, block.timestamp);
        emit InvoiceUpdated(invoiceId, oldStatus, newStatus, block.timestamp);
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
        Agreement storage agreement = agreements[invoiceId];
        
        require(
            msg.sender == agreement.issuer || 
            msg.sender == agreement.payer ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized to cancel"
        );
        
        require(
            agreement.status == InvoiceStatus.Pending || 
            agreement.status == InvoiceStatus.Draft ||
            (agreement.status == InvoiceStatus.PartiallyPaid && msg.sender == agreement.payer),
            "Cannot cancel at this stage"
        );
        
        InvoiceStatus oldStatus = agreement.status;
        agreement.status = InvoiceStatus.Cancelled;
        agreement.lastModifiedAt = block.timestamp;
        
        emit InvoiceCancelled(invoiceId, msg.sender, reason, block.timestamp);
        emit InvoiceUpdated(invoiceId, oldStatus, agreement.status, block.timestamp);
    }
    
    /**
     * @notice Mark expired invoices (operator only)
     */
    function markAsExpired(uint256 invoiceId)
        external
        whenNotPaused
        invoiceExists(invoiceId)
        onlyRole(OPERATOR_ROLE)
    {
        Agreement storage agreement = agreements[invoiceId];
        
        require(
            agreement.status == InvoiceStatus.Pending || 
            agreement.status == InvoiceStatus.PartiallyPaid,
            "Invoice not in valid state for expiration"
        );
        
        require(block.timestamp > agreement.terms.dueDate, "Not yet expired");
        
        InvoiceStatus oldStatus = agreement.status;
        agreement.status = InvoiceStatus.Expired;
        agreement.lastModifiedAt = block.timestamp;
        
        emit InvoiceExpired(invoiceId, block.timestamp);
        emit InvoiceUpdated(invoiceId, oldStatus, agreement.status, block.timestamp);
    }
    
    /**
     * @notice Internal function to create recurring invoice
     */
    function _createRecurringInvoice(uint256 originalId) private {
        Agreement storage original = agreements[originalId];
        
        uint256 newInvoiceId = _nextInvoiceId++;
        Agreement storage newAgreement = agreements[newInvoiceId];
        
        newAgreement.id = newInvoiceId;
        newAgreement.issuer = original.issuer;
        newAgreement.payer = original.payer;
        newAgreement.receiver = original.receiver;
        newAgreement.totalAmount = original.totalAmount;
        newAgreement.tokenAddress = original.tokenAddress;
        newAgreement.status = InvoiceStatus.Pending;
        newAgreement.terms = original.terms;
        newAgreement.terms.dueDate = block.timestamp + original.recurringInterval;
        newAgreement.metadata = original.metadata;
        newAgreement.createdAt = block.timestamp;
        newAgreement.lastModifiedAt = block.timestamp;
        newAgreement.isRecurring = true;
        newAgreement.recurringInterval = original.recurringInterval;
        newAgreement.nextRecurringDate = block.timestamp + (2 * original.recurringInterval);
        
        _issuerInvoices[original.issuer].push(newInvoiceId);
        _payerInvoices[original.payer].push(newInvoiceId);
        _receiverInvoices[original.receiver].push(newInvoiceId);
        
        original.nextRecurringDate = newAgreement.nextRecurringDate;
        
        emit RecurringInvoiceCreated(originalId, newInvoiceId, block.timestamp);
        emit InvoiceCreated(
            newInvoiceId,
            original.issuer,
            original.payer,
            original.receiver,
            original.totalAmount,
            original.tokenAddress,
            block.timestamp
        );
    }
    
    // ============ Query Functions ============
    
    function getAgreement(uint256 invoiceId) 
        external 
        view 
        invoiceExists(invoiceId)
        returns (Agreement memory) 
    {
        return agreements[invoiceId];
    }
    
    function getDispute(uint256 disputeId) 
        external 
        view 
        returns (Dispute memory) 
    {
        return disputes[disputeId];
    }
    
    function getInvoiceDispute(uint256 invoiceId)
        external
        view
        returns (Dispute memory)
    {
        uint256 disputeId = invoiceToDispute[invoiceId];
        require(disputeId > 0, "No dispute for this invoice");
        return disputes[disputeId];
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
    
    function getTotalDisputes() external view returns (uint256) {
        return _nextDisputeId - 1;
    }
    
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokenList;
    }
    
    // ============ Admin Functions ============
    
    function updatePlatformSettings(
        uint256 platformFee,
        uint256 maxAmount,
        uint256 minAmount,
        uint256 disputePeriod,
        uint256 autoTimeout,
        bool requireKYC,
        uint256 kycThreshold
    ) external onlyRole(ADMIN_ROLE) {
        require(platformFee <= 1000, "Fee too high"); // Max 10%
        
        platformSettings.platformFee = platformFee;
        platformSettings.maxInvoiceAmount = maxAmount;
        platformSettings.minInvoiceAmount = minAmount;
        platformSettings.defaultDisputePeriod = disputePeriod;
        platformSettings.autoCompleteTimeout = autoTimeout;
        platformSettings.requireKYC = requireKYC;
        platformSettings.kycThreshold = kycThreshold;
        
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
    
    function setKYCStatus(address user, bool verified) 
        external 
        onlyRole(OPERATOR_ROLE) 
    {
        kycVerified[user] = verified;
        emit KYCUpdated(user, verified, block.timestamp);
    }
    
    function batchSetKYCStatus(address[] calldata users, bool verified)
        external
        onlyRole(OPERATOR_ROLE)
    {
        for (uint256 i = 0; i < users.length; i++) {
            kycVerified[users[i]] = verified;
            emit KYCUpdated(users[i], verified, block.timestamp);
        }
    }
    
    function saveInvoiceTemplate(
        bytes32 templateId,
        InvoiceMetadata calldata metadata
    ) external onlyRole(OPERATOR_ROLE) {
        invoiceTemplates[templateId] = metadata;
    }
    
    function saveTermsTemplate(
        bytes32 templateId,
        PaymentTerms calldata terms
    ) external onlyRole(OPERATOR_ROLE) {
        termsTemplates[templateId] = terms;
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
