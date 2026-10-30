package com.grocery.store.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromEmail;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    // Send order confirmation email after successful payment
    public void sendOrderConfirmationEmail(
            String customerEmail,
            Long orderId,
            double totalAmount) {

        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(fromEmail);
        message.setTo(customerEmail);
        message.setSubject("FreshCart - Order Confirmation");

        message.setText(
                "Hello Customer,\n\n"
                + "Thank you for shopping with FreshCart!\n\n"
                + "Your payment was successful, and your order has been confirmed.\n\n"
                + "Order ID: " + orderId + "\n"
                + "Total Amount: Rs. " + totalAmount + "\n"
                + "Order Status: PLACED\n"
                + "Payment Status: PAID\n\n"
                + "Thank you for choosing FreshCart!\n"
                + "Happy Shopping!\n\n"
                + "FreshCart Team"
        );

        mailSender.send(message);
    }

    // Send low-stock alert email to the admin
    public void sendLowStockAlertEmail(
            String adminEmail,
            String productName,
            Long productId,
            int stock) {

        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(fromEmail);
        message.setTo(adminEmail);
        message.setSubject("FreshCart - Low Stock Alert");

        message.setText(
                "Hello FreshCart Admin,\n\n"
                + "A product is running low on stock.\n\n"
                + "Product ID: " + productId + "\n"
                + "Product Name: " + productName + "\n"
                + "Current Stock: " + stock + "\n\n"
                + "Please restock this product.\n\n"
                + "Regards,\n"
                + "FreshCart System"
        );

        mailSender.send(message);
    }
}