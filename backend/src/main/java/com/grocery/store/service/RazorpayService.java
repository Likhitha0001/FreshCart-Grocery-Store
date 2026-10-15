
package com.grocery.store.service;

import com.razorpay.RazorpayClient;
import com.razorpay.RazorpayException;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class RazorpayService {

    @Value("${razorpay.key.id}")
    private String keyId;

    @Value("${razorpay.key.secret}")
    private String keySecret;

    // Create a Razorpay order
    public JSONObject createRazorpayOrder(
            double amount,
            Long localOrderId) throws RazorpayException {

        RazorpayClient client =
                new RazorpayClient(keyId, keySecret);

        JSONObject request = new JSONObject();

        // Convert rupees to paise
        long amountInPaise = Math.round(amount * 100);

        request.put("amount", amountInPaise);
        request.put("currency", "INR");
        request.put("receipt", "freshcart_" + localOrderId);

        com.razorpay.Order razorpayOrder =
                client.orders.create(request);

        return razorpayOrder.toJson();
    }

    // Verify Razorpay payment signature
    public boolean verifyPaymentSignature(
            String razorpayOrderId,
            String razorpayPaymentId,
            String razorpaySignature) {

        try {
            JSONObject attributes = new JSONObject();

            attributes.put(
                    "razorpay_order_id",
                    razorpayOrderId
            );

            attributes.put(
                    "razorpay_payment_id",
                    razorpayPaymentId
            );

            attributes.put(
                    "razorpay_signature",
                    razorpaySignature
            );

            return com.razorpay.Utils.verifyPaymentSignature(
                    attributes,
                    keySecret
            );

        } catch (Exception exception) {
            return false;
        }
    }

    // Return public Key ID for React Checkout
    public String getKeyId() {
        return keyId;
    }
}
