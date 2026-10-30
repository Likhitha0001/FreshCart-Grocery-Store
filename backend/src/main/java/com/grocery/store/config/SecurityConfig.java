
package com.grocery.store.config;

import com.grocery.store.security.JwtAuthenticationFilter;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http)
            throws Exception {

        http
            // Enable CORS
            .cors(Customizer.withDefaults())

            // REST APIs use JWT, so disable CSRF
            .csrf(csrf -> csrf.disable())

            // Do not create HTTP sessions
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // Authorization rules
            .authorizeHttpRequests(auth -> auth

                // Public registration and login
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/users/register",
                    "/api/users/login"
                ).permitAll()

                // Allow error handling endpoint
                .requestMatchers("/error").permitAll()

                // Public product viewing
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/products",
                    "/api/products/**"
                ).permitAll()

                // Admin-only product creation
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/products",
                    "/api/products/**"
                ).hasRole("ADMIN")

                // Admin-only product updates
                .requestMatchers(
                    HttpMethod.PUT,
                    "/api/products",
                    "/api/products/**"
                ).hasRole("ADMIN")

                // Admin-only product deletion
                .requestMatchers(
                    HttpMethod.DELETE,
                    "/api/products",
                    "/api/products/**"
                ).hasRole("ADMIN")

                // Admin-only background job monitoring
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/admin/background-job/status"
                ).hasRole("ADMIN")

                // Admin-only order listing
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/orders",
                    "/api/orders/"
                ).hasRole("ADMIN")

                // Other order viewing requires authentication
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/orders/**"
                ).authenticated()

                // Order creation and payment verification
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/orders",
                    "/api/orders/verify-payment"
                ).authenticated()

                // Admin-only user listing
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/users"
                ).hasRole("ADMIN")

                // Other user endpoints require authentication
                .requestMatchers(
                    "/api/users/**"
                ).authenticated()

                // Everything else requires authentication
                .anyRequest().authenticated()
            )

            // Add JWT authentication filter
            .addFilterBefore(
                jwtAuthenticationFilter,
                UsernamePasswordAuthenticationFilter.class
            );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration configuration = new CorsConfiguration();

        // Local frontend development origins
        configuration.setAllowedOrigins(List.of(
            "http://localhost:5185",
            "http://localhost:5184",
            "http://localhost:5181",
            "http://localhost:5173"
        ));

        configuration.setAllowedMethods(List.of(
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ));

        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration("/**", configuration);

        return source;
    }
}
