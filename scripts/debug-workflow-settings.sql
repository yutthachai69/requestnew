
-- Check Workflow Transitions for a Category (e.g., ID 1 or the one used in testing)
SELECT 
    wt.id, 
    c.name as "Category",
    cs.code as "FromStatus", 
    a."actionName" as "Action",
    r."roleName" as "RequiredRole",
    ns.code as "ToStatus",
    wt."stepSequence",
    wt."correctionTypeId"
FROM "WorkflowTransition" wt
JOIN "Category" c ON wt."categoryId" = c.id
JOIN "Status" cs ON wt."currentStatusId" = cs.id
JOIN "Action" a ON wt."actionId" = a.id
JOIN "Role" r ON wt."requiredRoleId" = r.id
JOIN "Status" ns ON wt."nextStatusId" = ns.id
WHERE wt."categoryId" = (SELECT id FROM "Category" LIMIT 1) -- Checking the first category as sample
ORDER BY wt."stepSequence", wt.id;
