
package com.grocery.store.controller;

import com.grocery.store.entity.User;
import com.grocery.store.repository.UserRepository;
import com.grocery.store.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "http://localhost:5181")
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public UserController(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    // User signup
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody User user) {

        if (user.getName() == null || user.getName().isBlank()
                || user.getEmail() == null || user.getEmail().isBlank()
                || user.getPassword() == null || user.getPassword().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message",
                            "Name, email and password are required"));
        }

        if (userRepository.findByEmail(user.getEmail().trim())
                .isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "Email already registered"));
        }

        User newUser = new User();
        newUser.setName(user.getName().trim());
        newUser.setEmail(user.getEmail().trim().toLowerCase());
        newUser.setPassword(passwordEncoder.encode(user.getPassword()));

        // Never accept an admin role from signup input.
        newUser.setRole("CUSTOMER");

        User savedUser = userRepository.save(newUser);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Registration successful");
        response.put("id", savedUser.getId());
        response.put("name", savedUser.getName());
        response.put("email", savedUser.getEmail());
        response.put("role", savedUser.getRole());

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // User signin
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody User user) {

        if (user.getEmail() == null || user.getPassword() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Email and password are required"));
        }

        User existingUser = userRepository
                .findByEmail(user.getEmail().trim().toLowerCase())
                .orElse(null);

        if (existingUser == null
                || !passwordEncoder.matches(
                        user.getPassword(), existingUser.getPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password"));
        }

        String token = jwtService.generateToken(existingUser);

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Login successful");
        response.put("token", token);
        response.put("id", existingUser.getId());
        response.put("name", existingUser.getName());
        response.put("email", existingUser.getEmail());
        response.put("role", existingUser.getRole());

        return ResponseEntity.ok(response);
    }

    // List users without exposing passwords
    @GetMapping
    public ResponseEntity<?> getAllUsers() {
        var users = userRepository.findAll().stream()
                .map(user -> Map.of(
                        "id", user.getId(),
                        "name", user.getName(),
                        "email", user.getEmail(),
                        "role", user.getRole()))
                .toList();

        return ResponseEntity.ok(users);
    }
}
