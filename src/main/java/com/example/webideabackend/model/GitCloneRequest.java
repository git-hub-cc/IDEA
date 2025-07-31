/**
 * GitCloneRequest.java
 * DTO for Git clone requests, containing the repository URL and credentials.
 */
package com.example.webideabackend.model;

import jakarta.validation.constraints.NotBlank;

/**
 * A record to encapsulate the data needed for a Git clone request.
 *
 * @param repositoryUrl The SSH URL of the repository to clone (e.g., "git@github.com:user/repo.git").
 * @param privateKey    The private SSH key content as a string.
 * @param passphrase    The optional passphrase for the private key.
 */
public record GitCloneRequest(
        @NotBlank(message = "Repository URL cannot be blank") String repositoryUrl,
        @NotBlank(message = "Private key cannot be blank") String privateKey,
        String passphrase
) {}