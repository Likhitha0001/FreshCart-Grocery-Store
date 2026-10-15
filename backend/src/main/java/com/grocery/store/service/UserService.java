package com.grocery.store.service;

import com.grocery.store.entity.User;
import com.grocery.store.repository.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserRepository repository;

    private final BCryptPasswordEncoder passwordEncoder =
            new BCryptPasswordEncoder();

    public UserService(UserRepository repository) {
        this.repository = repository;
    }

    public User register(User user) {

        user.setPassword(
                passwordEncoder.encode(user.getPassword())
        );

        return repository.save(user);
    }

    public User login(String email, String password) {

        return repository.findByEmail(email)
                .filter(user ->
                        passwordEncoder.matches(
                                password,
                                user.getPassword()
                        )
                )
                .orElse(null);
    }
}