package com.grocery.store.scheduler;

import com.grocery.store.entity.Product;
import com.grocery.store.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class OrderBackgroundJob {

    private static final Logger logger =
            LoggerFactory.getLogger(OrderBackgroundJob.class);

    private final ProductRepository productRepository;

    public OrderBackgroundJob(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    // Run automatically every 60 seconds
    @Scheduled(fixedRate = 60000)
    public void checkLowStockProducts() {

        logger.info("FreshCart background job started: Checking product stock.");

        try {
            List<Product> products = productRepository.findAll();

            boolean lowStockFound = false;

            for (Product product : products) {

                // Update this getter if your Product entity uses a different name.
                if (product.getStock() <= 5) {

                    lowStockFound = true;

                    logger.warn(
                            "LOW STOCK ALERT: Product ID={}, Product Name={}, Stock={}",
                            product.getId(),
                            product.getName(),
                            product.getStock()
                    );
                }
            }

            if (!lowStockFound) {
                logger.info("Stock check completed. No low-stock products found.");
            }

        } catch (Exception e) {
            logger.error("Error occurred while checking product stock.", e);
        }
    }
}