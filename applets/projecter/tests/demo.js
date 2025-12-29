#!/usr/bin/env node
/**
 * Projecter Applet Demonstration
 * 
 * This script demonstrates the core functionality of the projecter applet
 * without requiring a running server.
 */

const {
  createProject,
  getAvailableTemplates,
  listExistingProjects,
  deleteProject,
  createResponse
} = require('../app.js');

async function runDemo() {
  console.log('🚀 Projecter Applet Demonstration');
  console.log('==================================\n');

  try {
    // 1. Show available templates
    console.log('📋 Available Templates:');
    console.log('----------------------');
    const templates = getAvailableTemplates();
    templates.forEach(template => {
      console.log(`• ${template.name} (${template.id})`);
      console.log(`  ${template.description}`);
      console.log(`  Files: ${template.files.join(', ')}`);
      console.log('');
    });

    // 2. Create a demo project for each language
    console.log('🏗️  Creating Demo Projects:');
    console.log('---------------------------');
    
    const languages = ['python', 'nodejs', 'c'];
    const createdProjects = [];

    for (const language of languages) {
      const projectName = `demo-${language}-${Date.now()}`;
      console.log(`Creating ${projectName}...`);
      
      const result = await createProject(projectName, language);
      if (result.success) {
        console.log(`✅ ${projectName} created successfully!`);
        console.log(`   Path: ${result.data.path}`);
        console.log(`   Files: ${result.data.files.join(', ')}`);
        createdProjects.push(projectName);
      } else {
        console.log(`❌ Failed to create ${projectName}: ${result.error}`);
      }
      console.log('');
    }

    // 3. List existing projects
    console.log('📁 Current Projects:');
    console.log('-------------------');
    const projects = await listExistingProjects();
    const demoProjects = projects.filter(p => p.name.startsWith('demo-'));
    
    if (demoProjects.length > 0) {
      demoProjects.forEach(project => {
        console.log(`• ${project.name} (${project.language})`);
        console.log(`  Created: ${project.created.toLocaleString()}`);
        console.log(`  Path: ${project.path}`);
        console.log('');
      });
    } else {
      console.log('No demo projects found.');
      console.log('');
    }

    // 4. Show a sample project file content
    if (createdProjects.length > 0) {
      console.log('📄 Sample Project Content:');
      console.log('--------------------------');
      
      const fs = require('fs').promises;
      const path = require('path');
      
      try {
        const pythonProject = createdProjects.find(name => name.includes('python'));
        if (pythonProject) {
          const mainPyPath = path.join(process.cwd(), 'projects', pythonProject, 'main.py');
          const content = await fs.readFile(mainPyPath, 'utf8');
          console.log(`Content of ${pythonProject}/main.py:`);
          console.log('```python');
          console.log(content);
          console.log('```\n');
        }
      } catch (error) {
        console.log('Could not read sample file content.\n');
      }
    }

    // 5. Clean up demo projects
    console.log('🧹 Cleaning up demo projects:');
    console.log('-----------------------------');
    
    for (const projectName of createdProjects) {
      console.log(`Deleting ${projectName}...`);
      const result = await deleteProject(projectName);
      if (result.success) {
        console.log(`✅ ${projectName} deleted successfully!`);
      } else {
        console.log(`❌ Failed to delete ${projectName}: ${result.error}`);
      }
    }

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📝 To use the projecter applet:');
    console.log('1. Start the server: node --watch server.js');
    console.log('2. Open http://localhost:3000/projecter/ in your browser');
    console.log('3. Or use the API endpoints:');
    console.log('   - GET  /projecter/templates');
    console.log('   - POST /projecter/create');
    console.log('   - GET  /projecter/projects');
    console.log('   - DELETE /projecter/projects/:name');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
  }
}

// Run the demo
if (require.main === module) {
  runDemo();
}

module.exports = { runDemo }; 