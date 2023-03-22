import BetterSqlite3 from "better-sqlite3";
import setupDatabase from "./setup/database";
import setupDirectories from "./setup/directories";

/**
 * Sets up the database and directories
 * @param db BetterSqlite3 database
 */
function fullSetup(db: BetterSqlite3.Database) {
    setupDatabase(db);
    setupDirectories();
}

export default fullSetup;
