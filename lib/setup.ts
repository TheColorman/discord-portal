import BetterSqlite3 from "better-sqlite3";
import setupDatabase from "./setup/databaseSetup";
import setupDirectories from "./setup/directorySetup";

/**
 * Sets up the database and directories
 * @param db BetterSqlite3 database
 */
function fullSetup(db: BetterSqlite3.Database) {
    setupDatabase(db);
    setupDirectories();
}

export default fullSetup;
