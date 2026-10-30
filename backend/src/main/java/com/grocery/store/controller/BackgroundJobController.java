package com.grocery.store.controller;

import com.grocery.store.entity.Product;
import com.grocery.store.repository.ProductRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/background-job")
public class BackgroundJobController {

    private final ProductRepository productRepository;

    public BackgroundJobController(
            ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @GetMapping("/status")
    public Map<String, Object> getStatus() {

        List<Product> lowStockProducts =
                productRepository.findAll()
                        .stream()
                        .filter(product -> product.getStock() <= 5)
                        .toList();

        Map<String, Object> response = new HashMap<>();

        response.put("jobName", "Low Stock Checker");
        response.put("checkInterval", "60 seconds");
        response.put("lowStockCount", lowStockProducts.size());

        response.put(
                "lowStockProducts",
                lowStockProducts.stream()
                        .map(product -> Map.of(
                                "id", product.getId(),
                                "name", product.getName(),
                                "stock", product.getStock()
                        ))
                        .toList()
        );

        return response;
    }
}