
package com.grocery.store.controller;

import com.grocery.store.entity.Order;
import com.grocery.store.entity.OrderItem;
import com.grocery.store.entity.Product;
import com.grocery.store.repository.OrderRepository;
import com.grocery.store.repository.ProductRepository;
import com.grocery.store.service.RazorpayService;
import com.razorpay.RazorpayException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.json.JSONObject;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/orders")
@CrossOrigin(origins = "http://localhost:5181")
public class OrderController {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final RazorpayService razorpayService;
    private final EntityManager entityManager;

    public OrderController(
            OrderRepository orderRepository,
            ProductRepository productRepository,
            RazorpayService razorpayService,
            EntityManager entityManager) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.razorpayService = razorpayService;
        this.entityManager = entityManager;
    }

    // CREATE PENDING ORDER AND RAZORPAY PAYMENT ORDER
    @PostMapping
    @Transactional
    public ResponseEntity<?> createOrder(@RequestBody Order order) {

        try {
            if (order.getItems() == null
                    || order.getItems().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Order must contain items"));
            }

            double total = 0;

            for (OrderItem item : order.getItems()) {

                if (item.getProductId() == null
                        || item.getQuantity() <= 0) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error",
                                    "Invalid product or quantity"));
                }

                Optional<Product> result =
                        productRepository.findById(item.getProductId());

                if (result.isEmpty()) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Product not found"));
                }

                Product product = result.get();

                if (!product.isAvailable()
                        || product.getStock() < item.getQuantity()) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error",
                                    "Product unavailable or insufficient stock: "
                                            + product.getName()));
                }

                item.setProductName(product.getName());
                item.setPrice(product.getPrice());

                total += product.getPrice() * item.getQuantity();
            }

            if (!Double.isFinite(total) || total <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid order total"));
            }

            order.setTotalAmount(total);
            order.setStatus("PAYMENT_PENDING");
            order.setPaymentStatus("PENDING");
            order.setRazorpayOrderId(null);
            order.setRazorpayPaymentId(null);

            Order savedOrder = orderRepository.saveAndFlush(order);

            JSONObject gatewayOrder =
                    razorpayService.createRazorpayOrder(
                            total, savedOrder.getId());

            String gatewayOrderId = gatewayOrder.getString("id");

            savedOrder.setRazorpayOrderId(gatewayOrderId);
            orderRepository.save(savedOrder);

            Map<String, Object> response = new HashMap<>();
            response.put("orderId", savedOrder.getId());
            response.put("razorpayOrderId", gatewayOrderId);
            response.put("amount", gatewayOrder.getLong("amount"));
            response.put("currency", "INR");
            response.put("keyId", razorpayService.getKeyId());
            response.put("totalAmount", total);

            return ResponseEntity.ok(response);

        } catch (RazorpayException exception) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error",
                            "Could not create Razorpay payment order"));
        } catch (Exception exception) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Could not create order"));
        }
    }

    // VERIFY PAYMENT AND REDUCE STOCK ONCE
    @PostMapping("/verify-payment")
    @Transactional
    public ResponseEntity<?> verifyPayment(
            @RequestBody Map<String, String> paymentData) {

        String localOrderIdText = paymentData.get("orderId");
        String gatewayOrderId = paymentData.get("razorpay_order_id");
        String paymentId = paymentData.get("razorpay_payment_id");
        String signature = paymentData.get("razorpay_signature");

        if (localOrderIdText == null
                || gatewayOrderId == null
                || paymentId == null
                || signature == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Missing payment details"));
        }

        try {
            Long localOrderId = Long.parseLong(localOrderIdText);

            Optional<Order> result =
                    orderRepository.findById(localOrderId);

            if (result.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Order order = result.get();

            if (order.getRazorpayOrderId() == null
                    || !order.getRazorpayOrderId().equals(gatewayOrderId)) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Order ID mismatch"));
            }

            // Prevent duplicate stock reduction.
            if ("PAID".equals(order.getPaymentStatus())) {
                if (paymentId.equals(order.getRazorpayPaymentId())) {
                    return ResponseEntity.ok(Map.of(
                            "message", "Payment already verified",
                            "orderId", order.getId(),
                            "paymentStatus", order.getPaymentStatus(),
                            "status", order.getStatus()));
                }

                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Order already paid"));
            }

            if (!"PENDING".equals(order.getPaymentStatus())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error",
                                "Order is not awaiting payment"));
            }

            boolean valid = razorpayService.verifyPaymentSignature(
                    gatewayOrderId, paymentId, signature);

            if (!valid) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error",
                                "Invalid payment signature"));
            }

            if (order.getItems() == null
                    || order.getItems().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Order has no items"));
            }

            // Combine quantities if the same product appears
            // more than once in an order.
            Map<Long, Integer> requiredQuantities =
                    new LinkedHashMap<>();

            for (OrderItem item : order.getItems()) {
                if (item.getProductId() == null
                        || item.getQuantity() <= 0) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error",
                                    "Invalid order item"));
                }

                requiredQuantities.merge(
                        item.getProductId(),
                        item.getQuantity(),
                        Integer::sum);
            }

            // Lock product rows while checking and updating stock.
            Map<Long, Product> lockedProducts = new LinkedHashMap<>();

            for (Long productId : requiredQuantities.keySet()) {
                Product product = entityManager.find(
                        Product.class,
                        productId,
                        LockModeType.PESSIMISTIC_WRITE);

                if (product == null) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error",
                                    "Product not found: " + productId));
                }

                int required = requiredQuantities.get(productId);

                if (!product.isAvailable()
                        || product.getStock() < required) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error",
                                    "Insufficient stock for "
                                            + product.getName()
                                            + ". Payment may have succeeded; "
                                            + "check payment and arrange a refund "
                                            + "if necessary."));
                }

                lockedProducts.put(productId, product);
            }

            // Update stock only after all products pass validation.
            for (Map.Entry<Long, Integer> entry
                    : requiredQuantities.entrySet()) {

                Product product = lockedProducts.get(entry.getKey());

                product.setStock(
                        product.getStock() - entry.getValue());

                if (product.getStock() == 0) {
                    product.setAvailable(false);
                }
            }

            order.setRazorpayPaymentId(paymentId);
            order.setPaymentStatus("PAID");
            order.setStatus("PLACED");

            orderRepository.save(order);

            return ResponseEntity.ok(Map.of(
                    "message", "Payment verified and stock updated",
                    "orderId", order.getId(),
                    "paymentStatus", order.getPaymentStatus(),
                    "status", order.getStatus()));

        } catch (NumberFormatException exception) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Invalid order ID"));
        }
    }

    // GET ALL ORDERS
    @GetMapping
    public ResponseEntity<List<Order>> getAllOrders() {
        return ResponseEntity.ok(orderRepository.findAll());
    }

    // GET ORDER BY ID
    @GetMapping("/{id}")
    public ResponseEntity<Order> getOrderById(
            @PathVariable Long id) {
        return orderRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
