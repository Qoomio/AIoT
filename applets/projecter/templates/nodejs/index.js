/**
 * Hello World Node.js Project
 */

console.log("Hello, World!");
console.log("Welcome to your new Node.js project!");

// Example function
function greetUser(name = "Developer") {
    return `Hello, ${name}! Welcome to Node.js!`;
}

console.log(greetUser());

// Export for potential testing
export default { greetUser };