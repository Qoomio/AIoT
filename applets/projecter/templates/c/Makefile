# Makefile for Hello World C Project

# Compiler settings
CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -O2
TARGET = hello_world
SOURCE = main.c

# Default target
all: $(TARGET)

# Build the executable
$(TARGET): $(SOURCE)
	$(CC) $(CFLAGS) -o $(TARGET) $(SOURCE)

# Clean build artifacts
clean:
	rm -f $(TARGET)

# Run the program
run: $(TARGET)
	./$(TARGET)

# Install dependencies (none for basic C)
install:
	@echo "No dependencies to install for basic C project"

.PHONY: all clean run install