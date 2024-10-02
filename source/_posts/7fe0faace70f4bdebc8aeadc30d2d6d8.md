---
title: Why and how we should Services object in Rails
permalink: why-and-how-we-should-services-object-in-rails/
date: 2024-06-02
author: Ông Già Coder EB
categories:
  - Làm
---

![code111.png](/images/7fe0faace70f4bdebc8aeadc30d2d6d8/code111.png)


As we all know, our ShareWis (WisdomBase) project is a 10-year-old monolithic Ruby on Rails project that strictly follows the MVC (Model View Controller) pattern. Thanks to the efforts of our engineering team, the source code remains maintainable, although it is becoming increasingly difficult. We have considered rewriting our monolithic project with an API-only approach and a newer version of Rails (which we have done but not yet delivered to Production), and possibly breaking it into several projects using other programming languages such as Python and Golang in the future. However, as our company grows with many organizational customers, any significant changes should be carefully considered and implemented. Therefore, in short term, we should focus on making our current legacy project more maintainable and less error-prone. To achieve this, we have started writing blogs to share knowledge and enhance our team's overall abilities and skills. In this blog post, I will explain why and how we should use Service Objects in our Ruby on Rails project (we have actually been using Service Objects for a few years now). Let’s started with what, why, and how.


## **What is a Service Object in Rails?**


A Service Object in Rails is a design pattern that encapsulates business logic that doesn't naturally fit into the traditional MVC (Model View Controller) architecture. Here are a few key points:

1. **Encapsulation of Business Logic**: Service Objects are used to encapsulate complex business logic that would otherwise clutter controllers or models. This keeps the codebase clean and easier to maintain.
2. **Single Responsibility Principle**: Each Service Object is responsible for a single piece of functionality, making the code more modular and easier to understand.
3. **Reusability**: By extracting business logic into Service Objects, we can reuse these objects across different parts of the application, promoting DRY (Don't Repeat Yourself) principles.
4. **Improved Testing**: Service Objects make it easier to write unit tests for specific business logic, improving the overall test coverage and reliability of the application.

### **Why We Use Service Objects in Rails**


There are several benefits to using Service Objects in a Rails application:

1. **Separation of Concerns**: Service Objects help separate business logic from controllers and models, making the application more organized and easier to manage.
2. **Code Clarity**: By isolating complex logic into Service Objects, the code becomes more readable and maintainable. Controllers and models stay focused on their primary responsibilities.
3. **Modularity**: Service Objects promote modularity, allowing developers to isolate and manage changes to specific parts of the application without affecting other areas.
4. **Reusability**: Service Objects can be reused across different parts of the application, reducing code duplication and promoting the DRY (Don't Repeat Yourself) principle.
5. **Testability**: Isolating business logic in Service Objects makes it easier to write unit tests. This improves the application's test coverage and ensures that each piece of functionality works correctly.
6. **Scalability**: As the application grows, Service Objects help manage complexity by keeping the codebase organized and modular. This makes it easier to add new features and maintain the existing code.

## **How We Should Use Service Objects in Rails**


Since we have been using Service Objects for years, all team members should be familiar with their usage in Ruby on Rails. However, I want to suggest some improvements to our current implementation. By adhering to the Single Responsibility Principle, we can implement "Callable Services." These are Service Objects with only one public method, named **`call`**, along with an initializer and any necessary private methods or helpers. Each Service Object should handle a single responsibility and only one single responsibility.


For example, in the next four screenshots, we have four Service Objects that manage certificate issuance after completing a lecture or exam. To issue a certificate, we need to pass data to the CraftMyPdf API. Therefore, we have three Service Objects for data preparation and one for the API call. In **`CraftMyPdfData`**, based on the input, we call either **`UserExamData`** or **`UserWorkflowData`**. Additionally, **`UserWorkflowData`** also calls **`UserExamData`** to promote reusability. All these Service Objects have only one public method, **`call`**, and adhere to single responsibility principles. This approach makes it easier to write unit tests, debug, and maintain the code. When errors occur, we can quickly identify whether the issue lies in the API call or with the data passed to CraftMyPdf, allowing us to focus our debugging efforts effectively.


![Untitled.png](/images/7fe0faace70f4bdebc8aeadc30d2d6d8/Untitled_5.png)


![Untitled.png](/images/7fe0faace70f4bdebc8aeadc30d2d6d8/Untitled_6.png)


![Untitled.png](/images/7fe0faace70f4bdebc8aeadc30d2d6d8/Untitled_7.png)


![Untitled.png](/images/7fe0faace70f4bdebc8aeadc30d2d6d8/Untitled_8.png)


In addition, using "Callable Service Objects" has a potential issue: sometimes, you might initialize the service but forget to call it. (This actually happened: [Slack Link](https://share-wis.slack.com/archives/C027UPPDEF2/p1715586285404229)). To address this, we can implement a **`Callable`** module and include it in every Callable Service Object. This module ensures that we never forget to call the **`call`** method by disabling the **`.new`** initializer. Instead, it allows us to call the service object directly with **`ServiceName.call(**params)`**.


![code111.png](/images/7fe0faace70f4bdebc8aeadc30d2d6d8/code111_1.png)


![Untitled.png](/images/7fe0faace70f4bdebc8aeadc30d2d6d8/Untitled_9.png)


In conclusion, adopting Service Objects in our Ruby on Rails project has proven to be a valuable practice for maintaining clean, modular, and testable code. By following the Single Responsibility Principle and implementing Callable Services, we have improved the clarity and maintainability of our codebase. This approach not only helps us manage complexity as our application grows but also ensures that our team can quickly identify and resolve issues. Sharing knowledge through these blog posts is an essential part of our continuous improvement efforts. By enhancing our skills and adopting best practices, we can deliver high-quality value to our project and our customers, making WisdomBase more solid. Thank you for reading, and we hope you find these insights useful.

